import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Redis from 'ioredis'

export async function GET(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        // Get worker session status
        const sessionSetting = await prisma.setting.findUnique({
            where: { key: 'worker_browser_session' }
        })

        let sessionStatus = 'غير متصل'
        let sessionAge = 0

        if (sessionSetting) {
            try {
                const sessionData = JSON.parse(sessionSetting.value)
                const createdAt = new Date(sessionData.createdAt)
                sessionAge = Math.floor((Date.now() - createdAt.getTime()) / 1000 / 60) // minutes

                if (sessionAge < 25) {
                    sessionStatus = 'متصل'
                } else {
                    sessionStatus = 'منتهي'
                }
            } catch (e) {
                sessionStatus = 'خطأ'
            }
        }

        // Get pending operations count
        const pendingCount = await prisma.operation.count({
            where: { status: 'PENDING' }
        })

        const processingCount = await prisma.operation.count({
            where: { status: 'PROCESSING' }
        })

        // Get today's stats
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const todayStats = await prisma.operation.groupBy({
            by: ['status'],
            where: {
                createdAt: { gte: today }
            },
            _count: { id: true }
        })

        const todayCompleted = todayStats.find(s => s.status === 'COMPLETED')?._count.id || 0
        const todayFailed = todayStats.find(s => s.status === 'FAILED')?._count.id || 0

        // Check Redis connection
        let redisStatus = 'غير متصل'
        try {
            const redis = new Redis(process.env.REDIS_URL || '', {
                maxRetriesPerRequest: 1,
                lazyConnect: true
            })
            await redis.connect()
            await redis.ping()
            redisStatus = 'متصل'
            await redis.quit()
        } catch (e) {
            redisStatus = 'غير متصل'
        }

        return NextResponse.json({
            session: {
                status: sessionStatus,
                ageMinutes: sessionAge
            },
            queue: {
                pending: pendingCount,
                processing: processingCount
            },
            today: {
                completed: todayCompleted,
                failed: todayFailed,
                successRate: todayCompleted + todayFailed > 0
                    ? Math.round((todayCompleted / (todayCompleted + todayFailed)) * 100)
                    : 0
            },
            redis: redisStatus
        })

    } catch (error) {
        console.error('Worker status error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
