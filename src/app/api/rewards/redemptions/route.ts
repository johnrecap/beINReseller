import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import { getAvailablePoints, validateRewardRedemption } from '@/lib/credit-requests/rewards'

const redemptionSchema = z.object({
    rewardId: z.string().min(1),
})

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = redemptionSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid redemption data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const [reward, ledgerEntries] = await Promise.all([
            prisma.reward.findUnique({
                where: { id: parsed.data.rewardId },
                select: {
                    id: true,
                    name: true,
                    pointsCost: true,
                    isActive: true,
                },
            }),
            prisma.pointLedgerEntry.findMany({
                where: { ownerUserId: authResult.user.id },
                select: { points: true, status: true },
            }),
        ])

        if (!reward) {
            return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
        }

        const availablePoints = getAvailablePoints(ledgerEntries)
        const validation = validateRewardRedemption({
            rewardIsActive: reward.isActive,
            pointsCost: reward.pointsCost,
            availablePoints,
        })

        if (!validation.ok) {
            return NextResponse.json(
                { error: validation.reason || 'Reward redemption is not allowed', availablePoints },
                { status: 400 }
            )
        }

        const redemption = await prisma.rewardRedemption.create({
            data: {
                rewardId: reward.id,
                rewardNameSnapshot: reward.name,
                pointsCostSnapshot: reward.pointsCost,
                ownerUserId: authResult.user.id,
                status: 'PENDING',
            },
        })

        return NextResponse.json({
            success: true,
            redemption: {
                id: redemption.id,
                rewardName: redemption.rewardNameSnapshot,
                pointsCost: redemption.pointsCostSnapshot,
                status: redemption.status,
                requestedAt: redemption.requestedAt.toISOString(),
            },
        }, { status: 201 })
    } catch (error) {
        console.error('Create reward redemption error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
