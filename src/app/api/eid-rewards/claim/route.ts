import { NextRequest, NextResponse } from 'next/server'
import { requireAuthAPI } from '@/lib/auth-utils'
import { EidRewardError, claimEidReward } from '@/lib/eid-rewards/claim'
import { RATE_LIMITS, rateLimitHeaders, withRateLimit } from '@/lib/rate-limiter'

function getRequestIp(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown'
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { allowed, result } = await withRateLimit(
            `eid-claim:${authResult.user.id}:${getRequestIp(request)}`,
            RATE_LIMITS.financial
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Too many Eid reward attempts' },
                { status: 429, headers: rateLimitHeaders(result) }
            )
        }

        const reward = await claimEidReward({
            userId: authResult.user.id,
            ipAddress: getRequestIp(request),
            userAgent: request.headers.get('user-agent'),
        })

        return NextResponse.json({
            success: true,
            ...reward,
            message: `مبروك! حصلت على ${reward.claim.points} نقطة`,
        }, { status: 201, headers: rateLimitHeaders(result) })
    } catch (error) {
        if (error instanceof EidRewardError) {
            const status = error.code === 'ALREADY_CLAIMED'
                ? 409
                : error.code === 'INACTIVE_USER'
                    ? 403
                    : 400
            return NextResponse.json({ error: error.message, code: error.code }, { status })
        }

        console.error('Eid reward claim error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
