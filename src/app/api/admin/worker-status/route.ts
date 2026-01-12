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
            } catch (e) {
                sessionStatus = 'ERROR'
            }
        }

        // Check Redis connection
        let redisStatus = 'DISCONNECTED'
        try {
            const redis = new Redis(process.env.REDIS_URL || '', {
                maxRetriesPerRequest: 1,
                lazyConnect: true
            })
            await redis.connect()
            await redis.ping()
            redisStatus = 'CONNECTED'
            await redis.quit()
        } catch (e) {
            redisStatus = 'DISCONNECTED'
        }

        return NextResponse.json({
            session: {
                status: sessionStatus,
                ageMinutes: sessionAge
            },
            redis: {
                status: redisStatus
            }
        })

    } catch (error) {
        console.error('Worker status error:', error)
        return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
    }
}
