import { NextRequest, NextResponse } from 'next/server'
import Redis from 'ioredis'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildForceUnlockAuditDetails,
    getAccountLockKey,
    readAccountLockStatus,
    validateForceUnlockReason,
} from '@/lib/operations/account-lock-release'

interface RouteParams {
    params: Promise<{ id: string }>
}

function getRedis() {
    return new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    let redis: Redis | null = null

    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json().catch(() => ({})) as { reason?: unknown }
        const reason = validateForceUnlockReason(body.reason)
        if (!reason) {
            return NextResponse.json({ error: 'Unlock reason is required' }, { status: 400 })
        }

        const account = await prisma.beinAccount.findUnique({
            where: { id },
            select: { id: true, username: true, label: true },
        })
        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }

        redis = getRedis()
        const lockStatus = await readAccountLockStatus(redis, id)
        if (!lockStatus.locked) {
            return NextResponse.json({ error: 'Account is not locked', lockStatus }, { status: 409 })
        }

        await redis.del(getAccountLockKey(id))
        const unlockedAt = new Date()
        const details = buildForceUnlockAuditDetails({
            accountId: account.id,
            accountLabel: account.label,
            accountUsername: account.username,
            lockStatus,
            reason,
            unlockedAt,
        })

        await prisma.activityLog.create({
            data: {
                userId: authResult.user.id,
                action: 'ADMIN_FORCE_UNLOCK_BEIN_ACCOUNT',
                targetId: account.id,
                targetType: 'BeinAccount',
                details: JSON.parse(JSON.stringify(details)),
                ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
                userAgent: request.headers.get('user-agent') || null,
            },
        })

        return NextResponse.json({
            success: true,
            message: 'Account lock released',
            lockStatus: {
                ...lockStatus,
                locked: false,
                stale: false,
                ttlSeconds: null,
            },
        })
    } catch (error) {
        console.error('Force unlock beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    } finally {
        if (redis) {
            await redis.quit().catch(() => undefined)
        }
    }
}
