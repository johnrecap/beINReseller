import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth-utils'
import { EidRewardRedeemError, redeemEidRewardPoints } from '@/lib/eid-rewards/redeem'
import { RATE_LIMITS, rateLimitHeaders, withRateLimit } from '@/lib/rate-limiter'

const redeemSchema = z.object({
    points: z.number().positive(),
})

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { allowed, result } = await withRateLimit(`eid-redeem:${authResult.user.id}`, RATE_LIMITS.financial)
        if (!allowed) {
            return NextResponse.json(
                { error: 'Too many Eid redemption attempts' },
                { status: 429, headers: rateLimitHeaders(result) }
            )
        }

        const body = await request.json().catch(() => null)
        const parsed = redeemSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid point conversion request' }, { status: 400 })
        }

        const redemption = await redeemEidRewardPoints({
            userId: authResult.user.id,
            pointsToConvert: parsed.data.points,
        })

        return NextResponse.json({
            success: true,
            redemption,
            message: 'تم تحويل النقاط إلى رصيد بنجاح.',
        }, { status: 201, headers: rateLimitHeaders(result) })
    } catch (error) {
        if (error instanceof EidRewardRedeemError) {
            const status = error.code === 'INSUFFICIENT_POINTS'
                ? 409
                : error.code === 'INACTIVE_OWNER'
                    ? 403
                    : 400
            return NextResponse.json({ error: error.message, code: error.code }, { status })
        }

        console.error('Eid reward redeem error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
