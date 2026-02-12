import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import Redis from 'ioredis'

interface RouteParams {
    params: Promise<{ id: string }>
}

// POST /api/admin/bein-accounts/[id]/reset - Reset account (clear cooldown, failures, etc.)
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const account = await prisma.beinAccount.findUnique({
            where: { id }
        })

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }

        // Reset account in database
        await prisma.beinAccount.update({
            where: { id },
            data: {
                consecutiveFailures: 0,
                cooldownUntil: null,
                lastError: null,
                lastErrorAt: null,
                isActive: true
            }
        })

        // Clear Redis data
        try {
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
            await redis.del(`bein:account:${id}:requests`)
            await redis.del(`bein:account:cooldown:${id}`)
            await redis.del(`bein:account:lock:${id}`)
            await redis.quit()
        } catch (redisError) {
            console.error('Redis cleanup error:', redisError)
        }

        // Invalidate old sessions
        await prisma.beinAccountSession.updateMany({
            where: { accountId: id },
            data: { isValid: false }
        })

        return NextResponse.json({
            success: true,
            message: 'Account reset successfully'
        })

    } catch (error) {
        console.error('Reset beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
