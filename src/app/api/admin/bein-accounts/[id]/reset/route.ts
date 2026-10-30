import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import Redis from 'ioredis'
import { recoverBeinAccount, BeinAccountRecoveryError } from '@/lib/bein-account-recovery'

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

        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000 })
        try {
            await recoverBeinAccount(prisma, redis, id, true)
        } finally { redis.disconnect() }

        return NextResponse.json({
            success: true,
            message: 'Account reset successfully'
        })

    } catch (error) {
        if (error instanceof BeinAccountRecoveryError) {
            return NextResponse.json({ error: error.code, code: error.code }, {
                status: error.code === 'BEIN_ACCOUNT_BUSY' ? 409 : 404,
            })
        }
        console.error('beIN account recovery failed')
        return NextResponse.json({ error: 'BEIN_ACCOUNT_RECOVERY_FAILED', code: 'BEIN_ACCOUNT_RECOVERY_FAILED' }, { status: 500 })
    }
}
