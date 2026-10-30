import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { getBeinLoginFailureThreshold } from '@/lib/get-bein-login-failure-threshold'
import { isCredentialLoginFailure } from '../../../../../../shared/bein/login-failure'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const threshold = await getBeinLoginFailureThreshold()

        const accounts = await prisma.beinAccount.findMany({
            where: {
                consecutiveLoginFailures: { gte: threshold }
            },
            orderBy: [
                { lastLoginFailureAt: 'desc' },
                { updatedAt: 'desc' }
            ],
            select: {
                id: true,
                username: true,
                label: true,
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
                requiresLoginReview: account.consecutiveLoginFailures >= threshold,
                needsPasswordUpdate: account.consecutiveLoginFailures >= threshold && isCredentialLoginFailure(account.lastLoginFailureReason ?? undefined),
                failureCategory: isCredentialLoginFailure(account.lastLoginFailureReason ?? undefined) ? 'credentials' : 'unknown',
            })),
        })
    } catch (error) {
        console.error('Get beIN login failures error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
