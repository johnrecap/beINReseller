/**
 * Redis Connection Singleton
 * 
 * All worker components share the same Redis connection to reduce
 * memory usage and connection overhead.
 * 
 * Features:
 * - Singleton pattern ensures single connection per worker process
 * - Lazy connection (connects on first command)
 * - Error handling and reconnection
 */

import Redis from 'ioredis'

let redisInstance: Redis | null = null
let redisUrl: string | null = null

/**
 * Get the shared Redis connection
 * Creates a new connection on first call, returns existing on subsequent calls
 */
export function getRedisConnection(url?: string): Redis {
    // If we have an instance and URL matches, return it
    if (redisInstance && (!url || url === redisUrl)) {
        return redisInstance
    }

    // Get URL from parameter or environment
    const connectionUrl = url || process.env.REDIS_URL
    if (!connectionUrl) {
        throw new Error('REDIS_URL environment variable is required')
    }

    // Store URL for comparison
    redisUrl = connectionUrl

    // Create new connection
    redisInstance = new Redis(connectionUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        retryStrategy: (times: number) => {
            if (times > 10) {
                console.error('❌ Redis: Max retry attempts reached')
                return null // Stop retrying
            }
            const delay = Math.min(times * 100, 3000)
            console.log(`🔄 Redis: Retrying connection in ${delay}ms (attempt ${times})`)
            return delay
        },
        lazyConnect: false, // Connect immediately for BullMQ
    })

    redisInstance.on('error', (err) => {
        console.error('❌ Redis connection error:', err.message)
    })

    redisInstance.on('connect', () => {
        console.log('📡 Redis connected')
    })

    redisInstance.on('ready', () => {
        console.log('✅ Redis ready')
    })

    redisInstance.on('close', () => {
        console.log('📡 Redis connection closed')
    })

    redisInstance.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...')
    })

    return redisInstance
}

/**
 * Get the current Redis instance without creating a new one
 * Returns null if no connection exists
 */
export function getRedisInstance(): Redis | null {
    return redisInstance
}

/**
 * Close the shared Redis connection
 * Should be called during graceful shutdown
 */
export async function closeRedisConnection(): Promise<void> {
    if (redisInstance) {
        try {
            await redisInstance.quit()
            console.log('📡 Redis connection closed gracefully')
        } catch (error) {
            console.error('Error closing Redis connection:', error)
            // Force disconnect if quit fails
            redisInstance.disconnect()
        }
        redisInstance = null
        redisUrl = null
    }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
    return redisInstance?.status === 'ready'
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): { connected: boolean; status: string | null } {
    return {
        connected: isRedisConnected(),
        status: redisInstance?.status || null
    }
}
