import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { getAvailablePoints } from '@/lib/credit-requests/rewards'

const decisionSchema = z.object({
    decision: z.enum(['APPROVE', 'REJECT', 'CANCEL']),
    note: z.string().trim().max(500).optional().or(z.literal('')),
})

type Decision = z.infer<typeof decisionSchema>['decision']

class RewardDecisionError extends Error {
    constructor(message: string, readonly status: number) {
        super(message)
    }
}

function decisionToStatus(decision: Decision) {
    switch (decision) {
        case 'APPROVE':
            return 'APPROVED' as const
        case 'REJECT':
            return 'REJECTED' as const
        case 'CANCEL':
            return 'CANCELLED' as const
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = decisionSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid decision data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const note = parsed.data.note?.trim() || null
        const nextStatus = decisionToStatus(parsed.data.decision)

        const result = await prisma.$transaction(async (tx) => {
            const redemption = await tx.rewardRedemption.findUnique({
                where: { id: params.id },
                include: {
                    owner: { select: { id: true, username: true, role: true } },
                },
            })

            if (!redemption) {
                throw new RewardDecisionError('Reward redemption not found', 404)
            }

            if (redemption.status !== 'PENDING') {
                throw new RewardDecisionError('Reward redemption is no longer pending', 409)
            }

            let ledgerEntryId: string | null = null
            let availableBefore: number | null = null
            let availableAfter: number | null = null

            if (parsed.data.decision === 'APPROVE') {
                await tx.user.update({
                    where: { id: redemption.ownerUserId },
                    data: { updatedAt: new Date() },
                    select: { id: true },
                })

                const ledgerEntries = await tx.pointLedgerEntry.findMany({
                    where: { ownerUserId: redemption.ownerUserId },
                    select: { points: true, status: true },
                })

                availableBefore = getAvailablePoints(ledgerEntries)
                if (availableBefore < redemption.pointsCostSnapshot) {
                    throw new RewardDecisionError('Insufficient available points', 409)
                }

                const ledgerEntry = await tx.pointLedgerEntry.create({
                    data: {
                        ownerUserId: redemption.ownerUserId,
                        ownerRoleAtTime: redemption.owner.role,
                        sourceType: 'REWARD_REDEMPTION',
                        sourceId: redemption.id,
                        points: -redemption.pointsCostSnapshot,
                        status: 'REDEEMED',
                        createdById: authResult.user.id,
                        notes: note
                            ? `Reward redemption approved for ${redemption.rewardNameSnapshot}: ${note}`
                            : `Reward redemption approved for ${redemption.rewardNameSnapshot}`,
                    },
                    select: { id: true },
                })
                ledgerEntryId = ledgerEntry.id
                availableAfter = availableBefore - redemption.pointsCostSnapshot
            }

            const updated = await tx.rewardRedemption.updateMany({
                where: {
                    id: redemption.id,
                    status: 'PENDING',
                    ledgerEntryId: null,
                },
                data: {
                    status: nextStatus,
                    decidedAt: new Date(),
                    decidedByAdminId: authResult.user.id,
                    decisionNote: note,
                    ledgerEntryId,
                },
            })

            if (updated.count !== 1) {
                throw new RewardDecisionError('Reward redemption was already decided', 409)
            }

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_REWARD_REDEMPTION_DECIDED',
                    targetId: redemption.id,
                    targetType: 'RewardRedemption',
                    details: {
                        ownerUserId: redemption.ownerUserId,
                        ownerUsername: redemption.owner.username,
                        rewardName: redemption.rewardNameSnapshot,
                        pointsCost: redemption.pointsCostSnapshot,
                        decision: parsed.data.decision,
                        nextStatus,
                        availableBefore,
                        availableAfter,
                        ledgerEntryId,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    userAgent: request.headers.get('user-agent'),
                },
            })

            return {
                requestStatus: nextStatus,
                ledgerEntryId,
                availableBefore,
                availableAfter,
            }
        })

        return NextResponse.json({ success: true, ...result })
    } catch (error) {
        if (error instanceof RewardDecisionError) {
            return NextResponse.json({ error: error.message }, { status: error.status })
        }

        console.error('Admin decide reward redemption error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
