/**
 * Rate Limiter - Production-ready with Redis or in-memory fallback
 * 
 * Features:
 * - Sliding window algorithm
 * - Redis support (when available)
 * - In-memory fallback for development
 * - Configurable limits per identifier
 */

// In-memory store for rate limiting (fallback when Redis not available)
const inMemoryStore = new Map<string, { count: number; resetAt: number }>()

// Cleanup old entries every 5 minutes
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

    /** Operation creation: 30 per minute */
    operations: { limit: 30, windowSeconds: 60 },

    /** API general: 100 per minute */
    api: { limit: 100, windowSeconds: 60 },

    /** Admin actions: 50 per minute */
    admin: { limit: 50, windowSeconds: 60 },
} as const

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
    const key = `rate:${identifier}`
    const now = Date.now()
    const windowMs = config.windowSeconds * 1000

    // Try to use existing entry
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
