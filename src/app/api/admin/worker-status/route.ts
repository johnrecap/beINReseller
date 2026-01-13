import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Redis from 'ioredis'
import { startOfDay } from 'date-fns'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        // Get worker session status
        const sessionSetting = await prisma.setting.findUnique({
            where: { key: 'worker_browser_session' }
        })

        let sessionStatus = 'DISCONNECTED'
        let sessionAge = 0

        if (sessionSetting) {
            try {
                const sessionData = JSON.parse(sessionSetting.value)
                const createdAt = new Date(sessionData.createdAt)
                sessionAge = Math.floor((Date.now() - createdAt.getTime()) / 1000 / 60) // minutes

                if (sessionAge < 25) {
                    sessionStatus = 'CONNECTED'
                } else {
                    sessionStatus = 'EXPIRED'
                }
            } catch {
                sessionStatus = 'ERROR'
            }
        }

        // Check Redis connection
        let redisStatus = 'DISCONNECTED'
        let queuePending = 0
        let queueProcessing = 0

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

            await redis.quit()
        } catch {
            redisStatus = 'DISCONNECTED'
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
