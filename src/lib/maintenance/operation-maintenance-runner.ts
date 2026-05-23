import crypto from 'node:crypto'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { recoverOperationIfNeeded } from '@/lib/operations/recovery'
import { runDispatchWatchdog } from '@/lib/operation-dispatch'

const LEADER_LOCK_KEY = 'operation-maintenance:leader'
export const MAINTENANCE_HEALTH_KEY = 'operation-maintenance:health'

type MaintenanceStatus = 'healthy' | 'degraded' | 'error' | 'idle'

export interface MaintenanceCycleSummary {
    cycleId: string
    status: MaintenanceStatus
    startedAt: string
    finishedAt: string
    durationMs: number
    inspected: number
    changed: number
    skipped: number
    retried: number
    reviewRequired: number
    refunded: number
    errors: string[]
}

export interface OperationMaintenanceRunnerOptions {
    intervalMs?: number
    leaderTtlMs?: number
    staleLimit?: number
    maxDispatchAttempts?: number
    once?: boolean
}

function envNumber(name: string, fallback: number): number {
    const value = Number(process.env[name])
    return Number.isFinite(value) && value > 0 ? value : fallback
}

async function acquireLeaderLock(token: string, ttlMs: number): Promise<boolean> {
    const result = await redis.set(LEADER_LOCK_KEY, token, 'PX', ttlMs, 'NX')
    return result === 'OK'
}

async function releaseLeaderLock(token: string) {
    const current = await redis.get(LEADER_LOCK_KEY)
    if (current === token) {
        await redis.del(LEADER_LOCK_KEY)
    }
}

async function saveHealth(summary: MaintenanceCycleSummary) {
    await redis.set(MAINTENANCE_HEALTH_KEY, JSON.stringify(summary), 'EX', 300)
}

async function findRecoverableOperationIds(now: Date, limit: number): Promise<string[]> {
    const completingCutoff = new Date(now.getTime() - 2 * 60 * 1000)
    const processingCutoff = new Date(now.getTime() - 5 * 60 * 1000)
    const awaitingPackageCutoff = new Date(now.getTime() - 15 * 60 * 1000)

    const operations = await prisma.operation.findMany({
        where: {
            OR: [
                {
                    status: 'PROCESSING',
                    updatedAt: { lt: processingCutoff },
                },
                {
                    status: 'AWAITING_PACKAGE',
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                        { updatedAt: { lt: awaitingPackageCutoff } },
                    ],
                },
                {
                    status: 'AWAITING_FINAL_CONFIRM',
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                    ],
                },
                {
                    status: 'COMPLETING',
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                        { updatedAt: { lt: completingCutoff } },
                    ],
                },
            ],
        },
        select: { id: true },
        orderBy: { updatedAt: 'asc' },
        take: limit,
    })

    return operations.map(operation => operation.id)
}

export async function runOperationMaintenanceCycle(
    options?: Pick<OperationMaintenanceRunnerOptions, 'staleLimit' | 'maxDispatchAttempts'>
): Promise<MaintenanceCycleSummary> {
    const started = new Date()
    const cycleId = crypto.randomUUID()
    const staleLimit = options?.staleLimit ?? envNumber('MAINTENANCE_STALE_LIMIT', 50)
    const maxDispatchAttempts = options?.maxDispatchAttempts ?? envNumber('MAINTENANCE_MAX_DISPATCH_ATTEMPTS', 3)

    let inspected = 0
    let changed = 0
    let skipped = 0
    let retried = 0
    let reviewRequired = 0
    let refunded = 0
    const errors: string[] = []

    try {
        const dispatch = await runDispatchWatchdog({
            maxAttempts: maxDispatchAttempts,
            limit: staleLimit,
        })
        inspected += dispatch.scanned
        changed += dispatch.recovered
        skipped += dispatch.skipped
        retried += dispatch.retried
        reviewRequired += dispatch.review
        refunded += dispatch.refunded
        errors.push(...dispatch.errors)

        const operationIds = await findRecoverableOperationIds(started, staleLimit)
        inspected += operationIds.length

        for (const operationId of operationIds) {
            try {
                const result = await recoverOperationIfNeeded(operationId, 'maintenance', { now: started })
                if (result.changed) changed++
                if (result.skipped || !result.changed) skipped++
                if (result.decision === 'RETRY_DISPATCH') retried++
                if (result.reviewRequired) reviewRequired++
                if (result.refundApplied) refunded++
            } catch (error) {
                console.error(`[Maintenance] Failed to recover operation ${operationId}:`, error)
                errors.push(operationId)
            }
        }
    } catch (error) {
        console.error('[Maintenance] Cycle failed:', error)
        errors.push(error instanceof Error ? error.message : String(error))
    }

    const finished = new Date()
    const summary: MaintenanceCycleSummary = {
        cycleId,
        status: errors.length > 0 ? 'degraded' : inspected > 0 ? 'healthy' : 'idle',
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        inspected,
        changed,
        skipped,
        retried,
        reviewRequired,
        refunded,
        errors,
    }

    await saveHealth(summary).catch(error => {
        console.error('[Maintenance] Failed to save health:', error)
    })

    console.log('[Maintenance] Cycle summary:', JSON.stringify({
        cycleId: summary.cycleId,
        status: summary.status,
        inspected,
        changed,
        skipped,
        retried,
        reviewRequired,
        refunded,
        errorCount: errors.length,
        durationMs: summary.durationMs,
    }))

    return summary
}

export async function startOperationMaintenanceRunner(options?: OperationMaintenanceRunnerOptions) {
    const intervalMs = options?.intervalMs ?? envNumber('MAINTENANCE_INTERVAL_MS', 30000)
    const leaderTtlMs = options?.leaderTtlMs ?? Math.max(intervalMs * 2, 60000)
    const token = `${process.pid}:${crypto.randomUUID()}`

    console.log(`[Maintenance] Starting operation maintenance runner interval=${intervalMs}ms`)

    const run = async () => {
        const hasLock = await acquireLeaderLock(token, leaderTtlMs).catch(error => {
            console.error('[Maintenance] Failed to acquire leader lock:', error)
            return false
        })

        if (!hasLock) {
            console.log('[Maintenance] Leader lock held by another runner; skipping cycle')
            return
        }

        try {
            await runOperationMaintenanceCycle(options)
        } finally {
            await releaseLeaderLock(token).catch(error => {
                console.error('[Maintenance] Failed to release leader lock:', error)
            })
        }
    }

    await run()
    if (options?.once) return

    const timer = setInterval(() => {
        run().catch(error => console.error('[Maintenance] Unhandled cycle error:', error))
    }, intervalMs)

    const stop = async () => {
        clearInterval(timer)
        await releaseLeaderLock(token).catch(() => undefined)
        await redis.quit().catch(() => undefined)
        await prisma.$disconnect().catch(() => undefined)
        process.exit(0)
    }

    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
}
