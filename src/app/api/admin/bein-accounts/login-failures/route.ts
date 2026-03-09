import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { getBeinLoginFailureThreshold } from '@/lib/get-bein-login-failure-threshold'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const threshold = await getBeinLoginFailureThreshold()

        const accounts = await prisma.beinAccount.findMany({
            where: {
                OR: [
                    { consecutiveLoginFailures: { gte: threshold } },
                    {
                        isActive: false,
                        lastLoginFailureReason: { startsWith: 'Low balance:' }
                    }
                ]
            },
            orderBy: [
                { lastLoginFailureAt: 'desc' },
                { updatedAt: 'desc' }
            ],
            select: {
                id: true,
                username: true,
                label: true,
                isActive: true,
                consecutiveLoginFailures: true,
                lastLoginAttemptAt: true,
                lastLoginFailureAt: true,
                lastLoginFailureReason: true,
                lastSuccessfulLoginAt: true,
            }
        })

        return NextResponse.json({
            success: true,
            threshold,
            accounts: accounts.map((account) => ({
                ...account,
                failureType: account.lastLoginFailureReason?.startsWith('Low balance:')
                    ? 'low_balance' as const
                    : 'login_failure' as const,
            })),
        })
    } catch (error) {
        console.error('Get beIN login failures error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
