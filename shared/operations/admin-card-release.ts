import type { Prisma, PrismaClient } from '@prisma/client'

export const ADMIN_CARD_RELEASE_ACTION = 'ADMIN_ARCHIVE_AND_UNLOCK_CARD' as const
export const ADMIN_OPERATION_STOPPED = 'ADMIN_OPERATION_STOPPED'
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
