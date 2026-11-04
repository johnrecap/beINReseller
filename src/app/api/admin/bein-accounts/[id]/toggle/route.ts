import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import Redis from 'ioredis'
import { recoverBeinAccount, BeinAccountRecoveryError } from '@/lib/bein-account-recovery'

interface RouteParams {
    params: Promise<{ id: string }>
}

// POST /api/admin/bein-accounts/[id]/toggle - Toggle account active status
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

        if (!account.isActive) {
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000 })
            try { await recoverBeinAccount(prisma, redis, id, true) }
            finally { redis.disconnect() }
        } else {
            await prisma.beinAccount.update({ where: { id }, data: { isActive: false } })
        }

        return NextResponse.json({
            success: true,
            account: {
                id: account.id,
                username: account.username,
                isActive: !account.isActive
            },
            message: !account.isActive ? 'Account activated' : 'Account deactivated'
        })

    } catch (error) {
        if (error instanceof BeinAccountRecoveryError) {
            return NextResponse.json({ error: error.code, code: error.code }, { status: error.code === 'BEIN_ACCOUNT_BUSY' ? 409 : 404 })
        }
        console.error('Toggle beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
