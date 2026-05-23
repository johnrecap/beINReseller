const ACCOUNT_LOCK_PREFIX = 'bein:account:lock:'

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

interface RedisAccountLockClient {
    get(key: string): Promise<string | null>
    eval(script: string, keyCount: number, ...args: Array<string | number>): Promise<unknown>
}

export function getAccountLockKey(accountId: string): string {
    return `${ACCOUNT_LOCK_PREFIX}${accountId}`
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

    if (currentOwner !== expectedOwner) {
        return { released: false, reason: 'owner_mismatch', currentOwner, expectedOwner }
    }

    return { released: true, reason: 'owner_matched', currentOwner, expectedOwner }
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

        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `
        const deleted = await redisClient.eval(script, 1, key, expectedOwner)
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
