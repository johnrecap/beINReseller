/**
 * Rate Limiter - Production-ready with Redis (primary) and in-memory fallback
 * 
 * Features:
 * - Sliding window algorithm using Redis INCR with EXPIRE
 * - Redis for distributed rate limiting across instances
 * - In-memory fallback for development/Redis failure
 * - Configurable limits per identifier
 */

import redis from '@/lib/redis'

// In-memory store for rate limiting (fallback when Redis not available)
const inMemoryStore = new Map<string, { count: number; resetAt: number }>()

// Track if Redis is available
let redisAvailable = true

// Cleanup old entries every 5 minutes (for in-memory fallback only)
setInterval(() => {
    const now = Date.now()
    inMemoryStore.forEach((value, key) => {
        if (now > value.resetAt) {
            inMemoryStore.delete(key)
        }
    })
}, 5 * 60 * 1000)

export interface RateLimitResult {
    success: boolean
    limit: number
    remaining: number
    reset: number
}

export interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    limit: number
    /** Window duration in seconds */
    windowSeconds: number
}

/**
 * Rate limiter configurations for different use cases
 */
export const RATE_LIMITS = {
    /** Login attempts: 5 per 15 minutes */
    login: { limit: 5, windowSeconds: 15 * 60 },

    /** Operation creation: 15 per minute */
    operations: { limit: 15, windowSeconds: 60 },

    /** API general: 100 per minute */
    api: { limit: 100, windowSeconds: 60 },

    /** Admin actions: 50 per minute */
    admin: { limit: 50, windowSeconds: 60 },

    /** Password change: 3 per hour */
    passwordChange: { limit: 3, windowSeconds: 60 * 60 },
} as const

/**
 * Check rate limit using Redis (primary) or in-memory fallback
 */
async function checkRateLimitRedis(
    key: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    try {
        const now = Math.floor(Date.now() / 1000)
        const windowStart = now - config.windowSeconds

        // Use Redis sorted set for sliding window
        const multi = redis.multi()

        // Remove old entries outside the window
        multi.zremrangebyscore(key, '-inf', windowStart)

        // Add current request with timestamp as score
        multi.zadd(key, now, `${now}:${Math.random()}`)

        // Count requests in window
        multi.zcard(key)

        // Set expiry on the key
        multi.expire(key, config.windowSeconds)

        const results = await multi.exec()

        if (!results || results.length < 4) {
            throw new Error('Redis transaction failed')
        }

        const count = results[2][1] as number
        const remaining = Math.max(0, config.limit - count)
        const success = count <= config.limit

        redisAvailable = true

        return {
            success,
            limit: config.limit,
            remaining,
            reset: config.windowSeconds,
        }
    } catch (error) {
        console.warn('Redis rate limit failed, falling back to in-memory:', error)
        redisAvailable = false
        throw error
    }
}

/**
 * In-memory rate limit fallback
 */
function checkRateLimitMemory(
    key: string,
    config: RateLimitConfig
): RateLimitResult {
    const now = Date.now()
    const windowMs = config.windowSeconds * 1000

    let entry = inMemoryStore.get(key)

    // Reset if window expired
    if (!entry || now > entry.resetAt) {
        entry = {
            count: 0,
            resetAt: now + windowMs,
        }
    }

    // Increment count
    entry.count++
    inMemoryStore.set(key, entry)

    const remaining = Math.max(0, config.limit - entry.count)
    const success = entry.count <= config.limit

    return {
        success,
        limit: config.limit,
        remaining,
        reset: Math.ceil((entry.resetAt - now) / 1000),
    }
}

/**
 * Check rate limit for an identifier
 * 
 * @param identifier - Unique identifier (e.g., userId, IP)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = RATE_LIMITS.api
): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`

    // Try Redis first if available
    if (redisAvailable) {
        try {
            return await checkRateLimitRedis(key, config)
        } catch {
            // Fall through to in-memory
        }
    }

    // Fallback to in-memory
    return checkRateLimitMemory(key, config)
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
    }
}

/**
 * Rate limiter middleware helper
 * Returns error response if rate limited, or null if allowed
 */
export async function withRateLimit(
    identifier: string,
    config: RateLimitConfig = RATE_LIMITS.api
): Promise<{ allowed: boolean; result: RateLimitResult }> {
    const result = await checkRateLimit(identifier, config)
    return { allowed: result.success, result }
}

/**
 * Check if Redis rate limiting is active
 */
export function isRedisRateLimitActive(): boolean {
    return redisAvailable
}
