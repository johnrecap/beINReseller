import { NextRequest, NextResponse } from 'next/server'
import { getManagerDashboardData } from '@/lib/manager-dashboard'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user } = authResult

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `manager:${user.id}`,
            RATE_LIMITS.manager
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        return NextResponse.json(await getManagerDashboardData(user))

    } catch (error) {
        console.error('Manager dashboard error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
