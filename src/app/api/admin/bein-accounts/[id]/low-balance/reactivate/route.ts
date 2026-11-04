import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import Redis from 'ioredis'
import { recoverBeinAccount, BeinAccountRecoveryError } from '@/lib/bein-account-recovery'

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
            select: { id: true, username: true, label: true }
        })

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }

        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000 })
        try { await recoverBeinAccount(prisma, redis, id, true) }
        finally { redis.disconnect() }

        console.log(`[Admin] Reactivated low-balance account: ${account.label || account.username}`)

        return NextResponse.json({
            success: true,
            message: `Account "${account.label || account.username}" reactivated successfully`
        })
    } catch (error) {
        if (error instanceof BeinAccountRecoveryError) {
            return NextResponse.json({ error: error.code, code: error.code }, { status: error.code === 'BEIN_ACCOUNT_BUSY' ? 409 : 404 })
        }
        console.error('Reactivate beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
