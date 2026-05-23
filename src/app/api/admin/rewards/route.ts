import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { summarizePointBalance } from '@/lib/credit-requests/rewards'

const rewardSchema = z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional().or(z.literal('')),
    pointsCost: z.number().positive().max(100000000),
    fulfillmentNotes: z.string().trim().max(1000).optional().or(z.literal('')),
    isActive: z.boolean().optional().default(true),
})

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const [rewards, redemptions, pendingPointOwners] = await Promise.all([
            prisma.reward.findMany({
                orderBy: { updatedAt: 'desc' },
                include: { _count: { select: { redemptions: true } } },
            }),
            prisma.rewardRedemption.findMany({
                orderBy: { requestedAt: 'desc' },
                take: 100,
                include: {
                    reward: { select: { id: true, name: true, isActive: true } },
                    owner: { select: { id: true, username: true, role: true } },
                },
            }),
            prisma.pointLedgerEntry.groupBy({
                by: ['ownerUserId'],
                where: { status: 'PENDING' },
                _sum: { points: true },
                _count: { id: true },
                orderBy: { _sum: { points: 'desc' } },
                take: 100,
            }),
        ])

        const ownerIds = Array.from(new Set([
            ...redemptions.map((item) => item.ownerUserId),
            ...pendingPointOwners.map((item) => item.ownerUserId),
        ]))
        const [owners, ledgerEntries] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: ownerIds } },
                select: { id: true, username: true, role: true },
            }),
            prisma.pointLedgerEntry.findMany({
                where: { ownerUserId: { in: ownerIds } },
                select: { ownerUserId: true, points: true, status: true },
            }),
        ])

        const ownersById = new Map(owners.map((owner) => [owner.id, owner]))
        const ledgerByOwner = new Map<string, typeof ledgerEntries>()
        for (const entry of ledgerEntries) {
            const entries = ledgerByOwner.get(entry.ownerUserId) || []
            entries.push(entry)
            ledgerByOwner.set(entry.ownerUserId, entries)
        }

        return NextResponse.json({
            rewards: rewards.map((reward) => ({
                id: reward.id,
                name: reward.name,
                description: reward.description,
                pointsCost: reward.pointsCost,
                isActive: reward.isActive,
                fulfillmentNotes: reward.fulfillmentNotes,
                redemptionsCount: reward._count.redemptions,
                createdAt: reward.createdAt.toISOString(),
                updatedAt: reward.updatedAt.toISOString(),
            })),
            redemptions: redemptions.map((redemption) => {
                const summary = summarizePointBalance(ledgerByOwner.get(redemption.ownerUserId) || [])
                return {
                    id: redemption.id,
                    rewardId: redemption.rewardId,
                    rewardName: redemption.rewardNameSnapshot,
                    currentRewardName: redemption.reward.name,
                    pointsCost: redemption.pointsCostSnapshot,
                    ownerUserId: redemption.ownerUserId,
                    ownerUsername: redemption.owner.username,
                    ownerRole: redemption.owner.role,
                    ownerAvailablePoints: Math.max(0, summary.availableToSpend),
                    status: redemption.status,
                    requestedAt: redemption.requestedAt.toISOString(),
                    decidedAt: redemption.decidedAt?.toISOString() ?? null,
                    decisionNote: redemption.decisionNote,
                    ledgerEntryId: redemption.ledgerEntryId,
                }
            }),
            pendingPointOwners: pendingPointOwners.map((item) => ({
                ownerUserId: item.ownerUserId,
                ownerUsername: ownersById.get(item.ownerUserId)?.username || 'Unknown',
                ownerRole: ownersById.get(item.ownerUserId)?.role || 'USER',
                pendingPoints: item._sum.points ?? 0,
                pendingEntries: item._count.id,
            })),
        })
    } catch (error) {
        console.error('Admin rewards list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = rewardSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid reward data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const reward = await prisma.$transaction(async (tx) => {
            const created = await tx.reward.create({
                data: {
                    name: parsed.data.name,
                    description: parsed.data.description?.trim() || null,
                    pointsCost: parsed.data.pointsCost,
                    fulfillmentNotes: parsed.data.fulfillmentNotes?.trim() || null,
                    isActive: parsed.data.isActive,
                    createdByAdminId: authResult.user.id,
                },
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_REWARD_CREATED',
                    targetId: created.id,
                    targetType: 'Reward',
                    details: {
                        name: created.name,
                        pointsCost: created.pointsCost,
                        isActive: created.isActive,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    userAgent: request.headers.get('user-agent'),
                },
            })

            return created
        })

        return NextResponse.json({ success: true, reward }, { status: 201 })
    } catch (error) {
        console.error('Admin create reward error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
