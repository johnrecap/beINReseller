import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth-utils'
import { PointCashRedemptionError, redeemPointsForBalance } from '@/lib/points/cash-redemption'

const cashRedemptionSchema = z.object({
    points: z.number().positive(),
})

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        if (!['USER', 'AGENT', 'MANAGER'].includes(authResult.user.role)) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
        }

        const body = await request.json().catch(() => null)
        const parsed = cashRedemptionSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid point conversion request', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const redemption = await redeemPointsForBalance({
            ownerUserId: authResult.user.id,
            pointsToConvert: parsed.data.points,
        })

        return NextResponse.json({
            success: true,
            redemption,
        }, { status: 201 })
    } catch (error) {
        if (error instanceof PointCashRedemptionError) {
            const status = error.code === 'INSUFFICIENT_POINTS'
                ? 409
                : error.code === 'INACTIVE_OWNER' || error.code === 'UNSUPPORTED_ROLE'
                    ? 403
                    : 400
            return NextResponse.json({ error: error.message, code: error.code }, { status })
        }

        console.error('Point cash redemption error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
