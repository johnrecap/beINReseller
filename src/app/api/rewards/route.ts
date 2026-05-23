import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import { summarizePointBalance } from '@/lib/credit-requests/rewards'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const [rewards, ledgerEntries, redemptions] = await Promise.all([
            prisma.reward.findMany({
                where: { isActive: true },
                orderBy: { pointsCost: 'asc' },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    pointsCost: true,
                    fulfillmentNotes: true,
                },
            }),
            prisma.pointLedgerEntry.findMany({
                where: { ownerUserId: authResult.user.id },
                select: { points: true, status: true },
            }),
            prisma.rewardRedemption.findMany({
                where: { ownerUserId: authResult.user.id },
                orderBy: { requestedAt: 'desc' },
                take: 50,
                select: {
                    id: true,
                    rewardNameSnapshot: true,
                    pointsCostSnapshot: true,
                    status: true,
                    requestedAt: true,
                    decidedAt: true,
                    decisionNote: true,
                },
            }),
        ])

        const summary = summarizePointBalance(ledgerEntries)

        return NextResponse.json({
            points: {
                pending: summary.pending,
                available: Math.max(0, summary.availableToSpend),
                redeemed: Math.abs(summary.redeemed),
                cancelled: summary.cancelled,
            },
            rewards: rewards.map((reward) => ({
                id: reward.id,
                name: reward.name,
                description: reward.description,
                pointsCost: reward.pointsCost,
                fulfillmentNotes: reward.fulfillmentNotes,
                canRedeem: summary.availableToSpend >= reward.pointsCost,
            })),
            redemptions: redemptions.map((redemption) => ({
                id: redemption.id,
                rewardName: redemption.rewardNameSnapshot,
                pointsCost: redemption.pointsCostSnapshot,
                status: redemption.status,
                requestedAt: redemption.requestedAt.toISOString(),
                decidedAt: redemption.decidedAt?.toISOString() ?? null,
                decisionNote: redemption.decisionNote,
            })),
        })
    } catch (error) {
        console.error('Rewards list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
