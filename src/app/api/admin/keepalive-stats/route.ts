/**
 * Keep-Alive Metrics API
 * GET /api/admin/keepalive-stats
 * 
 * Returns session keep-alive statistics from Redis.
 * Used by admin panel to monitor session health.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import Redis from 'ioredis'

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export async function GET(request: NextRequest) {
    try {
        // Check admin auth
        const session = await auth()
        if (!session?.user || session.user.role !== 'ADMIN') {
            return errorResponse('Unauthorized', 401)
        }

        // Get metrics from Redis
        const metricsKey = 'bein:keepalive:metrics'
        const metricsJson = await redis.get(metricsKey)

        if (!metricsJson) {
            return successResponse({
                status: 'no_data',
                message: 'Keep-alive service has not run yet or metrics expired',
                metrics: null
            })
        }

        const metrics = JSON.parse(metricsJson)

        // Get session TTLs for all accounts
        const sessionKeys = await redis.keys('bein:session:*')
        const sessionStatus: Record<string, { ttlMinutes: number; status: string }> = {}

        for (const key of sessionKeys) {
            const accountId = key.replace('bein:session:', '')
            const ttl = await redis.ttl(key)
            sessionStatus[accountId] = {
                ttlMinutes: ttl > 0 ? Math.floor(ttl / 60) : 0,
                status: ttl > 5 * 60 ? 'healthy' : ttl > 0 ? 'expiring_soon' : 'expired'
            }
        }

        return successResponse({
            status: 'ok',
            metrics: {
                ...metrics,
                currentSessionStatus: sessionStatus,
                activeSessionCount: sessionKeys.length
            }
        })

    } catch (error) {
        return handleApiError(error)
    }
}
