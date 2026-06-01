const ACCOUNT_LOCK_PREFIX = 'bein:account:lock:'
const DEFAULT_STALE_LOCK_SECONDS = 300

export type AccountLockReleaseReason =
    | 'no_account'
    | 'missing_expected_owner'
    | 'no_lock'
    | 'owner_matched'
    | 'owner_mismatch'
    | 'owner_changed'
    | 'redis_error'

export interface AccountLockReleaseDecision {
    released: boolean
    reason: AccountLockReleaseReason
    currentOwner?: string | null
    expectedOwner?: string | null
}
export interface AccountLockReleaseEvidence {
    attempted: boolean
    released: boolean
    reason: AccountLockReleaseReason
    currentOwner?: string | null
    expectedOwner?: string | null
}
export interface ParsedAccountLockOwner {
    raw: string | null
    workerId: string | null
    operationId: string | null
    acquiredAt: string | null
    legacy: boolean
}

export interface AccountLockStatus {
    locked: boolean
    stale: boolean
    rawOwner: string | null
    ownerWorkerId: string | null
    ownerOperationId: string | null
    acquiredAt: string | null
    ageSeconds: number | null
    ttlSeconds: number | null
    legacy: boolean
}

export interface ForceUnlockAuditDetails {
    accountId: string
    accountLabel: string | null
    accountUsername: string
    reason: string
    unlockedAt: string
    locked: boolean
    stale: boolean
    ownerWorkerId: string | null
    ownerOperationId: string | null
    lockAgeSeconds: number | null
    lockTtlSeconds: number | null
    previousLockOwner: string | null
    financialStatusChanged: false
    operationStatusChanged: false
}

interface RedisAccountLockClient {
    get(key: string): Promise<string | null>
    eval(script: string, keyCount: number, ...args: Array<string | number>): Promise<unknown>
}

export function getAccountLockKey(accountId: string): string {
    return `${ACCOUNT_LOCK_PREFIX}${accountId}`
}

export function parseAccountLockOwner(currentOwner: string | null): ParsedAccountLockOwner {
    if (!currentOwner) {
        return {
            raw: null,
            workerId: null,
            operationId: null,
            acquiredAt: null,
            legacy: false,
        }
    }

    try {
        const parsed = JSON.parse(currentOwner) as Record<string, unknown>
        return {
            raw: currentOwner,
            workerId: typeof parsed.workerId === 'string' ? parsed.workerId : null,
            operationId: typeof parsed.operationId === 'string' ? parsed.operationId : null,
            acquiredAt: typeof parsed.acquiredAt === 'string' ? parsed.acquiredAt : null,
            legacy: false,
        }
    } catch {
        return {
            raw: currentOwner,
            workerId: currentOwner,
            operationId: null,
            acquiredAt: null,
            legacy: true,
        }
    }
}

function ownerMatchesExpected(currentOwner: string, expectedOwner: string): boolean {
    if (currentOwner === expectedOwner) return true
    const parsed = parseAccountLockOwner(currentOwner)
    return parsed.workerId === expectedOwner || parsed.operationId === expectedOwner
}

export function getAccountLockReleaseDecision(
    currentOwner: string | null,
    expectedOwner: string | null | undefined
): AccountLockReleaseDecision {
    if (!expectedOwner) {
        return { released: false, reason: 'missing_expected_owner', currentOwner, expectedOwner: null }
    }

    if (!currentOwner) {
        return { released: false, reason: 'no_lock', currentOwner, expectedOwner }
    }

    if (!ownerMatchesExpected(currentOwner, expectedOwner)) {
        return { released: false, reason: 'owner_mismatch', currentOwner, expectedOwner }
    }

    return { released: true, reason: 'owner_matched', currentOwner, expectedOwner }
}

export function buildAccountLockStatus(
    currentOwner: string | null,
    options: {
        now?: Date
        ttlSeconds?: number | null
        staleAfterSeconds?: number
    } = {}
): AccountLockStatus {
    const parsed = parseAccountLockOwner(currentOwner)
    const now = options.now ?? new Date()
    const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_LOCK_SECONDS
    const acquiredAtTime = parsed.acquiredAt ? new Date(parsed.acquiredAt).getTime() : NaN
    const ageSeconds = Number.isFinite(acquiredAtTime)
        ? Math.max(0, Math.floor((now.getTime() - acquiredAtTime) / 1000))
        : null
    const locked = !!currentOwner

    return {
        locked,
        stale: locked && ageSeconds !== null && ageSeconds >= staleAfterSeconds,
        rawOwner: currentOwner,
        ownerWorkerId: parsed.workerId,
        ownerOperationId: parsed.operationId,
        acquiredAt: parsed.acquiredAt,
        ageSeconds,
        ttlSeconds: options.ttlSeconds ?? null,
        legacy: parsed.legacy,
    }
}

export function validateForceUnlockReason(reason: unknown): string | null {
    if (typeof reason !== 'string') return null
    const trimmed = reason.trim()
    if (!trimmed) return null
    return trimmed.slice(0, 240)
}

export function buildForceUnlockAuditDetails(input: {
    accountId: string
    accountLabel: string | null
    accountUsername: string
    lockStatus: AccountLockStatus
    reason: string
    unlockedAt: Date
}): ForceUnlockAuditDetails {
    return {
        accountId: input.accountId,
        accountLabel: input.accountLabel,
        accountUsername: input.accountUsername,
        reason: input.reason,
        unlockedAt: input.unlockedAt.toISOString(),
        locked: input.lockStatus.locked,
        stale: input.lockStatus.stale,
        ownerWorkerId: input.lockStatus.ownerWorkerId,
        ownerOperationId: input.lockStatus.ownerOperationId,
        lockAgeSeconds: input.lockStatus.ageSeconds,
        lockTtlSeconds: input.lockStatus.ttlSeconds,
        previousLockOwner: input.lockStatus.rawOwner,
        financialStatusChanged: false,
        operationStatusChanged: false,
    }
}

export async function readAccountLockStatus(
    redisClient: { get(key: string): Promise<string | null>; ttl(key: string): Promise<number> },
    accountId: string,
    options: { now?: Date; staleAfterSeconds?: number } = {}
): Promise<AccountLockStatus> {
    const key = getAccountLockKey(accountId)
    const [currentOwner, ttlSeconds] = await Promise.all([
        redisClient.get(key),
        redisClient.ttl(key).catch(() => null),
    ])

    return buildAccountLockStatus(currentOwner, {
        now: options.now,
        ttlSeconds,
        staleAfterSeconds: options.staleAfterSeconds,
    })
}

export async function releaseAccountLockSafely(
    redisClient: RedisAccountLockClient,
    accountId: string | null,
    expectedOwner?: string | null
): Promise<AccountLockReleaseEvidence> {
    if (!accountId) {
        return { attempted: false, released: false, reason: 'no_account' }
    }

    const key = getAccountLockKey(accountId)

    try {
        const currentOwner = await redisClient.get(key)
        const decision = getAccountLockReleaseDecision(currentOwner, expectedOwner)
        if (!decision.released || !expectedOwner) {
            return { attempted: true, ...decision }
        }

        const ownerToDelete = decision.currentOwner
        if (!ownerToDelete) {
            return { attempted: true, released: false, reason: 'owner_changed', expectedOwner }
        }
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `
        const deleted = await redisClient.eval(script, 1, key, ownerToDelete)
        if (deleted === 1) {
            return { attempted: true, ...decision }
        }

        return {
            attempted: true,
            released: false,
            reason: 'owner_changed',
            currentOwner,
            expectedOwner,
        }
    } catch {
        return { attempted: true, released: false, reason: 'redis_error', expectedOwner: expectedOwner ?? null }
    }
}
