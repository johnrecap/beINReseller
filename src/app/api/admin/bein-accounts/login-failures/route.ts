import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { decodeLoginHealthReason } from '../../../../../../shared/bein/login-health'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const threshold = 1 // Deprecated compatibility metadata; never read the old setting.

        const accounts = await prisma.beinAccount.findMany({
            where: {
                OR: [{ lastLoginFailureAt: { not: null } }, { consecutiveLoginFailures: { gt: 0 } }],
            },
            orderBy: [
                { lastLoginFailureAt: 'desc' },
                { updatedAt: 'desc' }
            ],
            select: {
                id: true,
                isActive: true,
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
            policy: 'first_terminal_failure',
            accounts: accounts.filter(account => !account.lastSuccessfulLoginAt ||
                (account.lastLoginFailureAt && account.lastLoginFailureAt > account.lastSuccessfulLoginAt))
                .map(account => {
                    const code = decodeLoginHealthReason(account.lastLoginFailureReason)
                    const category = code === 'CREDENTIALS_REJECTED' ? 'credentials' : code === 'CAPTCHA_EXHAUSTED' ? 'captcha' :
                        code === 'CONNECTION_FAILED' ? 'transport' : code === 'RATE_LIMITED' ? 'rate_limit' : code === 'SYSTEM_ERROR' ? 'system' : 'unknown'
                    const review = code !== null && ['credentials', 'captcha', 'unknown'].includes(category)
                    return { ...account, lastLoginFailureReason: code, failureCode: code, failureCategory: category,
                        requiresLoginReview: review, needsPasswordUpdate: code === 'CREDENTIALS_REJECTED',
                        recoveryGuidance: review ? 'ADMIN_REVIEW_AND_RECOVER' : 'CHECK_CONNECTION_AND_RETRY' }
                }),
        })
    } catch (error) {
        console.error('Get beIN login failures error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
