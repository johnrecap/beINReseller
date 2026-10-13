import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { RENEWAL_BLOCKING_ISSUES } from './renewal-pre-payment'
import { quoteData } from './package-quote'

export const ADMIN_CARD_RELEASE_ACTION = 'ADMIN_ARCHIVE_AND_UNLOCK_CARD' as const
export const ADMIN_OPERATION_STOPPED = 'ADMIN_OPERATION_STOPPED'
const ACTIVE = ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING'] as const
type Db = Prisma.TransactionClient
type ReleaseRedis = { eval(script: string, keys: number, ...args: Array<string | number>): Promise<unknown> }

export class AdministrativeStopError extends Error {
    constructor() { super(ADMIN_OPERATION_STOPPED); this.name = 'AdministrativeStopError' }
}

/** Allowlisted database metadata only: never log messages, SQL, values or stacks. */
export function administrativeReleaseDiagnostic(error: unknown) {
    const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const root = record(error)
    const adapter = record(record(root.meta).driverAdapterError)
    const nodes = [root, record(root.cause), adapter, record(adapter.cause)]
    const codes = nodes.flatMap(node => [node.code, node.originalCode]).filter((code): code is string => typeof code === 'string')
    const databaseCode = codes.find(code => /^(?!P\d{4}$)[0-9A-Z]{5}$/.test(code)) ?? null
    const errorCode = codes.find(code => /^P\d{4}$/.test(code)) ?? null
    const transportCode = codes.find(code => ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(code)) ?? null
    const constraint = nodes.flatMap(node => [node.constraint, node.message, node.originalMessage])
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.match(/(?:check constraint ")?\b(operation_review_adjudications_check_[12])\b/)?.[1])
        .find(Boolean) ?? null
    return { errorCode, databaseCode, transportCode, constraint }
}

export async function assertAdministrativeExecutionAllowed(db: Pick<Db, 'operation'>, operationId: string) {
    const op = await db.operation.findUnique({ where: { id: operationId }, select: { administrativeStopRequestedAt: true } })
    if (op?.administrativeStopRequestedAt) throw new AdministrativeStopError()
}

export async function beginOperationProviderRequest(db: PrismaClient, operationId: string, method: string) {
    return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM operations WHERE id = ${operationId} FOR UPDATE`
        await assertAdministrativeExecutionAllowed(tx, operationId)
        return tx.operationProviderRequest.create({ data: { operationId, method: method.toUpperCase(),
            deadlineAt: new Date(Date.now() + 45_000) } })
    })
}

export async function finishOperationProviderRequest(db: PrismaClient, id: string, resultCode: string) {
    const { row, stopped } = await db.$transaction(async tx => {
        const row = await tx.operationProviderRequest.findUniqueOrThrow({ where: { id }, select: { operationId: true } })
        await tx.$queryRaw`SELECT id FROM operations WHERE id = ${row.operationId} FOR UPDATE`
        const operation = await tx.operation.findUniqueOrThrow({ where: { id: row.operationId }, select: { administrativeStopRequestedAt: true } })
        const stopped = Boolean(operation.administrativeStopRequestedAt)
        await tx.operationProviderRequest.update({ where: { id }, data: { finishedAt: new Date(), resultCode,
            observedAfterStop: stopped } })
        return { row, stopped }
    })
    if (stopped) {
        console.info('[AdminCardRelease]', JSON.stringify({ operationId: row.operationId, stage: 'LATE_PROVIDER_OBSERVATION', resultCode }))
        throw new AdministrativeStopError()
    }
}

async function lockCard(tx: Db, card: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`renewal-card-lifecycle:${card}`}, 0))::text`
}

export async function cardReleasePreview(db: Db | PrismaClient, cardNumber: string) {
    if (!/^\d{1,64}$/.test(cardNumber)) throw new Error('INVALID_CARD_NUMBER')
    const now = new Date()
    const rows = await db.operation.findMany({ where: { cardNumber, administrativeReleaseId: null, OR: [
        { status: { in: [...ACTIVE, 'REVIEW_REQUIRED'] } },
        { integrityIssues: { some: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, issueType: { in: [...RENEWAL_BLOCKING_ISSUES] } } } },
        { cardLifecycleReservation: { is: { releasedAt: null } } },
        { providerAccountCausalReservation: { is: { releasedAt: null } } },
        { type: 'RENEW', renewalCooldownUntil: { gt: now } },
    ] }, orderBy: { id: 'asc' }, select: { id: true, status: true, type: true, updatedAt: true, amount: true,
        providerPaymentState: true, providerMutationStage: true, renewalCooldownUntil: true, selectedPackage: true,
        transactions: { orderBy: { id: 'asc' }, select: { id: true, type: true, amount: true } },
        chargedBeinSpendLedger: { select: { id: true } }, fulfillmentProof: { select: { id: true } },
        manualFulfillmentEvidence: { select: { id: true } },
        dispatches: { orderBy: { id: 'asc' }, select: { id: true, status: true, attempts: true, updatedAt: true } },
        integrityIssues: { orderBy: { id: 'asc' }, where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }, select: { id: true, issueType: true, lastSeenAt: true } },
        cardLifecycleReservation: { select: { id: true, releasedAt: true } },
        providerAccountCausalReservation: { select: { id: true, releasedAt: true, reservationGeneration: true } },
    } })
    const wallet = await db.walletTransaction.findMany({ where: { referenceId: { in: rows.map(row => row.id) } },
        orderBy: { id: 'asc' }, select: { id: true, referenceId: true, referenceType: true, type: true, amount: true } })
    const fingerprint = createHash('sha256').update(JSON.stringify({ rows, wallet })).digest('hex')
    return { cardNumber, fingerprint, operationId: rows[0]?.id ?? null, operations: rows.map(row => ({
        id: row.id, status: row.status, paymentState: row.providerPaymentState ?? 'UNKNOWN',
        packageName: typeof quoteData(row.selectedPackage).name === 'string' ? String(quoteData(row.selectedPackage).name) : null,
        stage: row.providerMutationStage ?? 'UNKNOWN',
        customerDeducted: row.transactions.filter(t => t.type === 'OPERATION_DEDUCT').reduce((n, t) => n - t.amount, 0) +
            wallet.filter(t => t.referenceId === row.id && t.type === 'DEBIT').reduce((n, t) => n + t.amount, 0),
        customerRefunded: row.transactions.filter(t => t.type === 'REFUND').reduce((n, t) => n + t.amount, 0) +
            wallet.filter(t => t.referenceId === row.id && t.referenceType === 'REFUND').reduce((n, t) => n + t.amount, 0),
        hasSaleEvidence: Boolean(row.fulfillmentProof || row.manualFulfillmentEvidence || row.chargedBeinSpendLedger),
        issueTypes: row.integrityIssues.map(issue => issue.issueType),
        cooldownUntil: row.renewalCooldownUntil?.toISOString() ?? null,
        cardReserved: row.cardLifecycleReservation?.releasedAt === null,
        accountReserved: row.providerAccountCausalReservation?.releasedAt === null,
    })) }
}

export async function requestCardRelease(db: PrismaClient, input: {
    operationId: string; actorId: string; note: string; decisionKey: string; fingerprint: string; acknowledgeRisk: boolean
}) {
    if (!input.acknowledgeRisk || !input.note.trim() || input.note.length > 2000 ||
        typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint) ||
        typeof input.decisionKey !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,200}$/.test(input.decisionKey)) throw new Error('INVALID_CARD_RELEASE_DECISION')
    return db.$transaction(async tx => {
        const source = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, select: { cardNumber: true } })
        await lockCard(tx, source.cardNumber)
        const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true, isActive: true } })
        if (actor?.role !== 'ADMIN' || !actor.isActive) throw new Error('ADMIN_REQUIRED')
        const replay = await tx.cardAdministrativeRelease.findUnique({ where: { decisionKey: input.decisionKey } })
        if (replay) {
            if (replay.cardNumber !== source.cardNumber || replay.actorId !== input.actorId || replay.note !== input.note.trim() || replay.fingerprint !== input.fingerprint)
                throw new Error('CARD_RELEASE_KEY_CONFLICT')
            return replay
        }
        const pending = await tx.cardAdministrativeRelease.findFirst({ where: { cardNumber: source.cardNumber, state: { not: 'COMPLETED' } } })
        if (pending) throw new Error('CARD_RELEASE_IN_PROGRESS')
        // Serialize scope observation with every in-flight operation write.
        await tx.$queryRaw`SELECT id FROM operations WHERE card_number = ${source.cardNumber} ORDER BY id FOR UPDATE`
        const preview = await cardReleasePreview(tx, source.cardNumber)
        if (preview.fingerprint !== input.fingerprint || !preview.operations.length) throw new Error('CARD_RELEASE_PREVIEW_CHANGED')
        const release = await tx.cardAdministrativeRelease.create({ data: { decisionKey: input.decisionKey,
            cardNumber: source.cardNumber, actorId: input.actorId, note: input.note.trim(), fingerprint: input.fingerprint } })
        const ids = preview.operations.map(op => op.id)
        await tx.operation.updateMany({ where: { id: { in: ids }, administrativeReleaseId: null },
            data: { administrativeReleaseId: release.id, administrativeStopRequestedAt: release.requestedAt } })
        await tx.operationDispatch.updateMany({ where: { operationId: { in: ids }, status: { in: ['PENDING', 'DISPATCHING'] } },
            data: { status: 'CANCELLED', lastError: ADMIN_OPERATION_STOPPED } })
        for (const op of preview.operations) await tx.operationReviewAdjudication.create({ data: {
            operationId: op.id, actorId: input.actorId, decisionKey: `${release.id}:${op.id}`, payloadFingerprint: input.fingerprint,
            decisionKind: ADMIN_CARD_RELEASE_ACTION, classification: 'ADMINISTRATIVE_ARCHIVE',
            normalizedEvidence: op as Prisma.InputJsonValue, sourceReference: release.id, observedAt: release.requestedAt,
            reasonCode: 'ADMIN_ACCEPTED_UNRESOLVED_FINANCIAL_RESULT', decisionNote: input.note.trim(),
        } })
        console.info('[AdminCardRelease]', JSON.stringify({ releaseId: release.id, stage: 'STOP_REQUESTED', operationIds: ids }))
        return release
    }, { timeout: 15000 })
}

export async function completeCardRelease(db: PrismaClient, releaseId: string, redis?: ReleaseRedis) {
    let result = await db.$transaction(async tx => {
        const release = await tx.cardAdministrativeRelease.findUniqueOrThrow({ where: { id: releaseId } })
        await lockCard(tx, release.cardNumber)
        const current = await tx.cardAdministrativeRelease.findUniqueOrThrow({ where: { id: releaseId } })
        if (current.state === 'COMPLETED') return current
        const operations = await tx.operation.findMany({ where: { administrativeReleaseId: releaseId }, select: { id: true } })
        const ids = operations.map(op => op.id)
        // HTTP registration and stop admission lock these same rows. Deadline is
        // longer than the transport's enforced total request lifetime.
        await tx.$queryRaw`SELECT id FROM operations WHERE administrative_release_id = ${releaseId} ORDER BY id FOR UPDATE`
        const now = new Date()
        const active = await tx.operationProviderRequest.count({ where: { operationId: { in: ids }, finishedAt: null, deadlineAt: { gt: now } } })
        if (active) {
            console.info('[AdminCardRelease]', JSON.stringify({ releaseId, stage: 'DRAINING', activeRequests: active }))
            return tx.cardAdministrativeRelease.update({ where: { id: releaseId }, data: { state: 'DRAINING', lastError: null } })
        }
        await tx.operationProviderRequest.updateMany({ where: { operationId: { in: ids }, finishedAt: null },
            data: { finishedAt: now, resultCode: 'DEADLINE_ELAPSED_RESULT_UNKNOWN', observedAfterStop: true } })
        await tx.operation.updateMany({ where: { administrativeReleaseId: releaseId }, data: { administrativeArchivedAt: now } })
        const card = await tx.cardLifecycleReservation.updateMany({ where: { operationId: { in: ids }, releasedAt: null },
            data: { releasedAt: now, releaseReason: `${ADMIN_CARD_RELEASE_ACTION}:${releaseId}` } })
        const account = await tx.providerAccountCausalReservation.updateMany({ where: { operationId: { in: ids }, releasedAt: null },
            data: { releasedAt: now, releaseReason: `${ADMIN_CARD_RELEASE_ACTION}:${releaseId}` } })
        const result = await tx.cardAdministrativeRelease.update({ where: { id: releaseId }, data: { state: 'COMPLETED', completedAt: now, lastError: null } })
        console.info('[AdminCardRelease]', JSON.stringify({ releaseId, stage: 'COMPLETED', operationIds: ids,
            cardReleased: card.count, accountReleased: account.count }))
        return result
    }, { timeout: 15000 })
    if (result.state === 'COMPLETED' && redis) {
        try {
            const operations = await db.operation.findMany({ where: { administrativeReleaseId: releaseId }, select: { id: true, beinAccountId: true } })
            const accounts = [...new Set(operations.map(op => op.beinAccountId).filter((id): id is string => Boolean(id)))]
            const keys = accounts.flatMap(id => [`bein:account:lock:${id}`, `bein:account:execution-lease:${id}`])
            const cleared = keys.length ? await redis.eval(`
                local scope = cjson.decode(ARGV[1])
                local cleared = 0
                for _, key in ipairs(KEYS) do
                    local raw = redis.call('GET', key)
                    if raw then
                        local ok, owner = pcall(cjson.decode, raw)
                        if ok and type(owner) == 'table' and scope[owner.operationId] then
                            cleared = cleared + redis.call('DEL', key)
                        end
                    end
                end
                return cleared`, keys.length, ...keys, JSON.stringify(Object.fromEntries(operations.map(op => [op.id, true])))) : 0
            if (result.lastError) result = await db.cardAdministrativeRelease.update({ where: { id: releaseId }, data: { lastError: null } })
            console.info('[AdminCardRelease]', JSON.stringify({ releaseId, stage: 'OWNED_LOCK_CLEANUP', cleared }))
        } catch {
            result = await db.cardAdministrativeRelease.update({ where: { id: releaseId }, data: { lastError: 'CARD_RELEASE_LOCK_CLEANUP_PENDING' } })
            console.warn('[AdminCardRelease]', JSON.stringify({ releaseId, stage: 'LOCK_CLEANUP_RETRY_REQUIRED' }))
        }
    }
    return result
}

let afterReleaseId: string | undefined
export async function resumeCardReleases(db: PrismaClient, limit = 50, redis?: ReleaseRedis) {
    limit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50
    const rows = await db.cardAdministrativeRelease.findMany({ where: { OR: [{ state: { not: 'COMPLETED' } }, { lastError: 'CARD_RELEASE_LOCK_CLEANUP_PENDING' }] },
        ...(afterReleaseId ? { cursor: { id: afterReleaseId }, skip: 1 } : {}),
        orderBy: { id: 'asc' }, take: limit, select: { id: true } })
    afterReleaseId = rows.length === limit ? rows.at(-1)!.id : undefined
    for (const row of rows) {
        try { await completeCardRelease(db, row.id, redis) }
        catch (error) { await db.cardAdministrativeRelease.update({ where: { id: row.id }, data: { lastError: 'CARD_RELEASE_RETRY_REQUIRED' } })
            console.error('[AdminCardRelease]', JSON.stringify({ releaseId: row.id, stage: 'RETRY_REQUIRED', ...administrativeReleaseDiagnostic(error) })) }
    }
    return rows.length
}
