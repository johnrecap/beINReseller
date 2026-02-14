import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import Redis from 'ioredis'
import { startOfDay } from 'date-fns'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        // Check Redis connection AND get session count
        // Worker saves sessions to Redis keys: bein:session:{accountId}
        let redisStatus = 'DISCONNECTED'
        let queuePending = 0
        let queueProcessing = 0
        let sessionStatus = 'DISCONNECTED'
        let sessionAge = 0
        let activeSessions = 0

        try {
            const redis = new Redis(process.env.REDIS_URL || '', {
                maxRetriesPerRequest: 1,
                lazyConnect: true
            })
            await redis.connect()
            await redis.ping()
            redisStatus = 'CONNECTED'

            // Get queue counts from Redis
            queuePending = await redis.llen('bein:operations:pending').catch(() => 0)
            queueProcessing = await redis.llen('bein:operations:processing').catch(() => 0)

            // Count active sessions in Redis (bein:session:* keys)
            const sessionKeys = await redis.keys('bein:session:*').catch(() => [])
            activeSessions = sessionKeys.length

            if (activeSessions > 0) {
                // Get the most recent session to check age
                const firstSessionData = await redis.get(sessionKeys[0]).catch(() => null)
                if (firstSessionData) {
                    try {
                        const sessionData = JSON.parse(firstSessionData)
                        if (sessionData.loginTimestamp) {
                            sessionAge = Math.floor((Date.now() - sessionData.loginTimestamp) / 1000 / 60)
                        }
                    } catch { /* ignore parse errors */ }
                }
                sessionStatus = 'CONNECTED'
            } else {
                sessionStatus = 'DISCONNECTED'
            }

            await redis.quit()
        } catch {
            redisStatus = 'DISCONNECTED'
            sessionStatus = 'DISCONNECTED'
        }

        // Get today's stats
        const today = startOfDay(new Date())
        const [completedToday, failedToday] = await Promise.all([
            prisma.operation.count({
                where: { createdAt: { gte: today }, status: 'COMPLETED' }
            }),
            prisma.operation.count({
                where: { createdAt: { gte: today }, status: 'FAILED' }
            })
        ])

        const totalToday = completedToday + failedToday
        const successRate = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0

        return NextResponse.json({
            session: {
                status: sessionStatus,
                ageMinutes: sessionAge
            },
            queue: {
                pending: queuePending,
                processing: queueProcessing
            },
            today: {
                completed: completedToday,
                failed: failedToday,
                successRate: successRate
            },
            redis: redisStatus  // STRING, not object!
        })

    } catch (error) {
        console.error('Worker status error:', error)
        return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
    }
}
