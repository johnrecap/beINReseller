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

        // Get worker session status from BeinAccountSession table
        // (The HTTP worker uses saveSessionToCache which writes to this table)
        const validSessions = await prisma.beinAccountSession.findMany({
            where: {
                isValid: true,
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                createdAt: true,
                expiresAt: true,
                accountId: true
            }
        })

        let sessionStatus = 'DISCONNECTED'
        let sessionAge = 0

        if (validSessions.length > 0) {
            const latestSession = validSessions[0]
            sessionAge = Math.floor((Date.now() - latestSession.createdAt.getTime()) / 1000 / 60) // minutes
            sessionStatus = 'CONNECTED'
        } else {
            // Check if there are any sessions at all (expired ones)
            const anySessions = await prisma.beinAccountSession.count()
            if (anySessions > 0) {
                sessionStatus = 'EXPIRED'
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
