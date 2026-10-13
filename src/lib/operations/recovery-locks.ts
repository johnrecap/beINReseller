import redis from '@/lib/redis'

const RECOVERY_LOCK_PREFIX = 'operation:recovery-lock:'
const PROVIDER_EXECUTION_LEASE_PREFIX = 'bein:account:execution-lease:'
const DEFAULT_RECOVERY_LOCK_TTL_SECONDS = 45

export function executionLeaseOwnedByOperation(rawOwner: string | null, operationId: string): boolean {
    if (!rawOwner) return false
    try {
        const owner = JSON.parse(rawOwner) as Record<string, unknown>
        return owner.operationId === operationId &&
            typeof owner.leaseId === 'string' && owner.leaseId.length > 0 &&
            typeof owner.fencingToken === 'number' && Number.isSafeInteger(owner.fencingToken) && owner.fencingToken > 0 &&
            typeof owner.reservationGeneration === 'number' && Number.isSafeInteger(owner.reservationGeneration) &&
            owner.reservationGeneration > 0 &&
            typeof owner.workerId === 'string' && owner.workerId.length > 0 &&
            typeof owner.acquiredAt === 'string' && Number.isFinite(new Date(owner.acquiredAt).getTime())
    } catch {
        return false
    }
}

export async function hasActiveProviderExecutionLeaseForOperation(
    accountId: string,
    operationId: string
): Promise<boolean> {
    // Redis GET returns null for an expired lease. An active matching owner
    // means maintenance must wait for the running worker to finish or lose it.
    return executionLeaseOwnedByOperation(
        await redis.get(`${PROVIDER_EXECUTION_LEASE_PREFIX}${accountId}`), operationId
    )
}

export interface RecoveryLockHandle {
    key: string
    owner: string
}

export async function acquireRecoveryLock(
    operationId: string,
    source: string,
    ttlSeconds: number = DEFAULT_RECOVERY_LOCK_TTL_SECONDS
): Promise<RecoveryLockHandle | null> {
    const owner = `${source}:${Date.now()}:${Math.random().toString(36).slice(2)}`
    const key = `${RECOVERY_LOCK_PREFIX}${operationId}`
    const result = await redis.set(key, owner, 'EX', ttlSeconds, 'NX')
    return result === 'OK' ? { key, owner } : null
}

export async function releaseRecoveryLock(handle: RecoveryLockHandle): Promise<boolean> {
    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `
    const result = await redis.eval(script, 1, handle.key, handle.owner)
    return result === 1
}
