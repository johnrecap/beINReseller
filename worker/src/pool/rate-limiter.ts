/**
 * Rate Limiter for beIN Accounts
 * Uses Redis Sorted Set for sliding window rate limiting
 */

import Redis from 'ioredis'

/**
 * Check if an account is within rate limits
 */
export async function checkRateLimit(
    redis: Redis,
    accountId: string,
    maxRequests: number,
    windowSeconds: number
): Promise<{ allowed: boolean; currentCount: number }> {
    const key = `bein:account:${accountId}:requests`
    const now = Date.now()
    const windowStart = now - windowSeconds * 1000

    // Count requests in the time window
    const count = await redis.zcount(key, windowStart, now)

    return {
        allowed: count < maxRequests,
        currentCount: count,
    }
}

/**
 * Record a request for rate limiting
 */
export async function recordRequest(
    redis: Redis,
    accountId: string,
    windowSeconds: number
): Promise<void> {
    const key = `bein:account:${accountId}:requests`
    const now = Date.now()
    const windowStart = now - windowSeconds * 1000

    // Use pipeline for atomicity
    await redis
        .multi()
        .zadd(key, now, `${now}`)
        .zremrangebyscore(key, 0, windowStart)
        .expire(key, windowSeconds)
        .exec()
}

/**
 * Get the count of requests in the current window
 */
export async function getRequestCount(
    redis: Redis,
    accountId: string,
    windowSeconds: number
): Promise<number> {
    const key = `bein:account:${accountId}:requests`
    const now = Date.now()
    const windowStart = now - windowSeconds * 1000

    return await redis.zcount(key, windowStart, now)
}

/**
 * Clear rate limit data for an account
 */
export async function clearRateLimit(
    redis: Redis,
    accountId: string
): Promise<void> {
    const key = `bein:account:${accountId}:requests`
    await redis.del(key)
}
