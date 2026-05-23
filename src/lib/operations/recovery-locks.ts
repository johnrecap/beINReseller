import redis from '@/lib/redis'

const RECOVERY_LOCK_PREFIX = 'operation:recovery-lock:'
const DEFAULT_RECOVERY_LOCK_TTL_SECONDS = 45

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
