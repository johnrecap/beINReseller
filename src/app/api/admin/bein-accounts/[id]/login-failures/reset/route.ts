import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import Redis from 'ioredis'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const account = await prisma.beinAccount.findUnique({
            where: { id },
            select: { id: true }
        })

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }

        await prisma.$transaction([
            prisma.beinAccount.update({
                where: { id },
                data: {
                    consecutiveLoginFailures: 0,
                    lastLoginAttemptAt: null,
                    lastLoginFailureAt: null,
                    lastLoginFailureReason: null,
                }
            }),
            prisma.beinAccountSession.updateMany({
                where: { accountId: id },
                data: { isValid: false }
            })
        ])

        try {
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
            await redis.del(`bein:session:${id}`)
            await redis.quit()
        } catch (redisError) {
            console.error('Redis login tracking cleanup error:', redisError)
        }

        return NextResponse.json({
            success: true,
            message: 'beIN login failure tracking reset successfully'
        })
    } catch (error) {
        console.error('Reset beIN login failures error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
