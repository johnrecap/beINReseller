import type { Prisma, PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { en } from '../../src/i18n/translations/en'
import { canonicalJson, quoteData } from './package-quote'

const RETRY_MS = [5000, 30000, 120000, 600000]
const KINDS = ['COMPLETION_NOTIFICATION', 'ACTIVITY_COUNTER', 'POINTS_AWARD_REFERENCE'] as const
type EffectDatabase = Pick<PrismaClient, 'operationCompletionEffect' | '$transaction'>

/** Called only by the committing completion writer, never by a historical scan. */
export async function captureCompletionEffects(tx: Prisma.TransactionClient, operationId: string, completedAt: Date) {
    const op = await tx.operation.findUnique({ where: { id: operationId }, select: {
        id: true, type: true, purpose: true, status: true, userId: true, customerId: true,
        amount: true, selectedPackage: true, completedAt: true, fulfillmentAuthority: true, beinAccountId: true,
    } })
    if (!op?.userId || op.customerId || op.type !== 'RENEW' || op.purpose === 'INSTALLMENT') return
    if (op.status !== 'COMPLETED' || op.fulfillmentAuthority === 'NONE' ||
        op.completedAt?.getTime() !== completedAt.getTime()) throw new Error('COMPLETION_EFFECT_CONTEXT_CONFLICT')
    const run = await tx.operationSpendAwardRun.findUnique({ where: { operationId }, select: { id: true } })
    const selected = quoteData(op.selectedPackage)
    const snapshot = { operationId, userId: op.userId, beinAccountId: op.beinAccountId, operationType: op.type, amount: op.amount,
        completedAt: completedAt.toISOString(), packageName: typeof selected.name === 'string' ? selected.name : '',
        fulfillmentAuthority: op.fulfillmentAuthority }
    for (const effectKind of KINDS) {
        if (effectKind === 'POINTS_AWARD_REFERENCE' && !run) continue
        const pointsAwardRunId = effectKind === 'POINTS_AWARD_REFERENCE' ? run!.id : null
        const existing = await tx.operationCompletionEffect.findUnique({
            where: { operationId_effectKind: { operationId, effectKind } },
        })
        if (existing) {
            if (existing.snapshotVersion !== 1 || canonicalJson(existing.completionSnapshot) !== canonicalJson(snapshot) ||
                existing.pointsAwardRunId !== pointsAwardRunId) throw new Error('COMPLETION_EFFECT_SNAPSHOT_CONFLICT')
        } else await tx.operationCompletionEffect.create({ data: {
            operationId, effectKind, completionSnapshot: snapshot, snapshotVersion: 1, pointsAwardRunId,
        } })
    }
}

export async function deliverCompletionEffects(db: EffectDatabase, options: { limit?: number; operationId?: string; now?: Date } = {}) {
    const now = options.now ?? new Date()
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, Math.floor(options.limit!))) : 50
    const leaseOwner = randomUUID()
    const rows = await db.operationCompletionEffect.findMany({ where: {
        operation: { administrativeStopRequestedAt: null },
        ...(options.operationId ? { operationId: options.operationId } : {}),
        OR: [{ state: 'PENDING', nextAttemptAt: { lte: now } }, { state: 'DELIVERING', nextAttemptAt: { lte: now } }],
    }, orderBy: { nextAttemptAt: 'asc' }, take: limit })
    let delivered = 0
    let retryScheduled = 0
    let exhausted = 0
    for (const row of rows) {
        if (row.attempts >= 5) {
            const stopped = await db.operationCompletionEffect.updateMany({ where: {
                id: row.id, state: row.state, attempts: row.attempts, nextAttemptAt: { lte: now },
            }, data: { state: 'EXHAUSTED', leaseOwner: null, leaseExpiresAt: null, lastError: 'COMPLETION_EFFECT_ATTEMPTS_EXHAUSTED' } })
            exhausted += stopped.count
            continue
        }
        const claimed = await db.operationCompletionEffect.updateMany({ where: {
            id: row.id, state: row.state, attempts: row.attempts, nextAttemptAt: { lte: now },
        }, data: { state: 'DELIVERING', leaseOwner, leaseExpiresAt: new Date(now.getTime() + 60000),
            nextAttemptAt: new Date(now.getTime() + 60000), attempts: { increment: 1 } } })
        if (!claimed.count) continue
        const owned = { id: row.id, state: 'DELIVERING', leaseOwner, attempts: row.attempts + 1 }
        try {
            const applied = await db.$transaction(async tx => {
                // Every side effect and its delivered marker share this commit.
                const locked = await tx.$queryRaw<Array<{ id: string }>>`
                    SELECT "id" FROM "operation_completion_effects" WHERE "id" = ${row.id} FOR UPDATE
                `
                if (!locked.length) return false
                const current = await tx.operationCompletionEffect.findFirst({ where: owned })
                if (!current) return false
                const snapshot = quoteData(current.completionSnapshot)
                const completedAt = new Date(String(snapshot.completedAt))
                if (current.snapshotVersion !== 1 || snapshot.operationId !== row.operationId ||
                    typeof snapshot.userId !== 'string' || !Number.isFinite(completedAt.getTime()) ||
                    typeof snapshot.amount !== 'number' || !Number.isFinite(snapshot.amount) ||
                    snapshot.operationType !== 'RENEW' || typeof snapshot.packageName !== 'string') {
                    throw new Error('COMPLETION_EFFECT_INVALID_SNAPSHOT')
                }
                const op = await tx.operation.findUnique({ where: { id: row.operationId }, select: {
                    status: true, userId: true, fulfillmentAuthority: true, completedAt: true,
                } })
                if (op?.status !== 'COMPLETED' || op.userId !== snapshot.userId ||
                    op.fulfillmentAuthority !== snapshot.fulfillmentAuthority || op.completedAt?.getTime() !== completedAt.getTime()) {
                    throw new Error('COMPLETION_EFFECT_CONTEXT_CONFLICT')
                }
                if (current.effectKind === 'COMPLETION_NOTIFICATION') {
                    await tx.notification.create({ data: { userId: snapshot.userId, title: en.renew.result.success,
                        message: snapshot.packageName, type: 'success', link: '/dashboard/history' } })
                } else if (current.effectKind === 'ACTIVITY_COUNTER') {
                    await tx.user.update({ where: { id: snapshot.userId }, data: { totalOperations: { increment: 1 } } })
                    await tx.user.updateMany({ where: { id: snapshot.userId,
                        OR: [{ lastOperationAt: null }, { lastOperationAt: { lt: completedAt } }] }, data: { lastOperationAt: completedAt } })
                    if (typeof snapshot.beinAccountId === 'string') {
                        await tx.beinAccount.update({ where: { id: snapshot.beinAccountId }, data: {
                            usageCount: { increment: 1 }, totalSuccess: { increment: 1 },
                        } })
                        await tx.beinAccount.updateMany({ where: { id: snapshot.beinAccountId,
                            OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: completedAt } }] }, data: { lastUsedAt: completedAt } })
                        await tx.beinAccount.updateMany({ where: { id: snapshot.beinAccountId,
                            OR: [{ lastErrorAt: null }, { lastErrorAt: { lte: completedAt } }] }, data: { consecutiveFailures: 0 } })
                    }
                    await tx.activityLog.create({ data: { userId: snapshot.userId, action: 'OPERATION_COMPLETE',
                        targetId: row.operationId, targetType: 'Operation', details: {
                            operationType: snapshot.operationType, amount: snapshot.amount, packageName: snapshot.packageName,
                        } } })
                } else if (current.effectKind === 'POINTS_AWARD_REFERENCE') {
                    const run = current.pointsAwardRunId && await tx.operationSpendAwardRun.findUnique({ where: { id: current.pointsAwardRunId } })
                    if (!run || run.operationId !== row.operationId) throw new Error('COMPLETION_EFFECT_POINTS_CONFLICT')
                    // The existing points maintenance owns captured recipients,
                    // rates and award retries. Never recalculate them here.
                } else throw new Error('COMPLETION_EFFECT_INVALID_KIND')
                await tx.operationCompletionEffect.update({ where: { id: row.id }, data: { state: 'DELIVERED',
                    deliveredAt: now, lastError: null, leaseOwner: null, leaseExpiresAt: null } })
                return true
            })
            if (applied) delivered++
        } catch {
            const terminal = row.attempts + 1 >= 5
            const changed = await db.operationCompletionEffect.updateMany({ where: owned, data: {
                state: terminal ? 'EXHAUSTED' : 'PENDING', leaseOwner: null, leaseExpiresAt: null,
                lastError: 'COMPLETION_EFFECT_DELIVERY_FAILED',
                nextAttemptAt: new Date(now.getTime() + RETRY_MS[Math.min(row.attempts, 3)]),
            } })
            if (changed.count) { if (terminal) exhausted++; else retryScheduled++ }
        }
    }
    const scope = options.operationId ? { operationId: options.operationId } : {}
    const backlog = await db.operationCompletionEffect.aggregate({ where: { ...scope, state: { in: ['PENDING', 'DELIVERING'] } },
        _count: true, _min: { createdAt: true } })
    const exhaustedCount = await db.operationCompletionEffect.count({ where: { ...scope, state: 'EXHAUSTED' } })
    return { inspected: rows.length, delivered, retryScheduled, exhausted, pending: backlog._count, exhaustedCount,
        oldestPendingAgeMs: backlog._min.createdAt ? Math.max(0, now.getTime() - backlog._min.createdAt.getTime()) : null }
}
