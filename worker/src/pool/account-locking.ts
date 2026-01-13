/**
 * Account Locking Utilities
 * Prevents multiple workers from using the same account simultaneously
 */

import Redis from 'ioredis'

const LOCK_PREFIX = 'bein:account:lock:'
const DEFAULT_LOCK_TTL = 120 // 2 minutes

/**
 * Acquire a lock on an account
 * Uses Redis SET NX for atomic locking
 */
export async function lockAccount(
    redis: Redis,
    accountId: string,
    workerId: string,
    ttlSeconds: number = DEFAULT_LOCK_TTL
): Promise<boolean> {
    const key = `${LOCK_PREFIX}${accountId}`
    const result = await redis.set(key, workerId, 'EX', ttlSeconds, 'NX')
    return result === 'OK'
}

/**
 * Release a lock on an account
 * Only releases if the lock is owned by the specified worker
 */
export async function unlockAccount(
    redis: Redis,
    accountId: string,
    workerId: string
): Promise<boolean> {
    const key = `${LOCK_PREFIX}${accountId}`

    // Lua script to atomically check and delete
    const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `

    const result = await redis.eval(script, 1, key, workerId)
    return result === 1
}

/**
 * Force release a lock (admin use only)
 */
export async function forceUnlockAccount(
    redis: Redis,
    accountId: string
): Promise<void> {
    const key = `${LOCK_PREFIX}${accountId}`
    await redis.del(key)
}

/**
 * Check if an account is locked
 */
export async function isAccountLocked(
    redis: Redis,
    accountId: string
): Promise<boolean> {
    const key = `${LOCK_PREFIX}${accountId}`
    const exists = await redis.exists(key)
    return exists === 1
}

/**
 * Get the worker ID that holds the lock
 */
export async function getLockOwner(
    redis: Redis,
    accountId: string
): Promise<string | null> {
    const key = `${LOCK_PREFIX}${accountId}`
    return await redis.get(key)
}

/**
 * Extend the lock TTL (keep-alive)
 */
export async function extendLock(
    redis: Redis,
    accountId: string,
    workerId: string,
    ttlSeconds: number = DEFAULT_LOCK_TTL
): Promise<boolean> {
    const key = `${LOCK_PREFIX}${accountId}`

    // Lua script to atomically check ownership and extend TTL
    const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `

    const result = await redis.eval(script, 1, key, workerId, ttlSeconds)
    return result === 1
}
