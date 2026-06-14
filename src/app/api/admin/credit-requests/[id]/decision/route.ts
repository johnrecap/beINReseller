import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import { createWhatsAppHandoffSnapshot } from '@/lib/credit-requests/whatsapp-handoff'
import { canActorManageCreditRequest } from '@/lib/credit-requests/permissions'
import {
    canApproveReservedCredit,
    getCreditDebtSummary,
    lockCreditDebtUser,
    normalizeMoney,
} from '@/lib/credit-requests/debt'

const decisionSchema = z.object({
    decision: z.enum(['APPROVE', 'REJECT', 'CANCEL']),
    note: z.string().trim().max(500).optional().or(z.literal('')),
})

type Decision = z.infer<typeof decisionSchema>['decision']

class CreditRequestDecisionError extends Error {
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

function buildDecisionNote(decision: Decision, requestNumber: string, note: string | null) {
    const prefix = decision === 'APPROVE'
        ? `Credit request ${requestNumber} approved`
        : decision === 'REJECT'
            ? `Credit request ${requestNumber} rejected`
            : `Credit request ${requestNumber} cancelled`

    return note ? `${prefix}: ${note}` : prefix
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params
        const authResult = await requireAuthAPI(request)
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
            const creditRequest = await tx.creditRequest.findUnique({
                where: { id: params.id },
                select: {
                    id: true,
                    requestNumber: true,
                    userId: true,
                    usernameSnapshot: true,
                    amountUsd: true,
                    status: true,
                    transactionId: true,
                    ownerTypeSnapshot: true,
                    ownerIdSnapshot: true,
                    ownerLabelSnapshot: true,
                    agentIdSnapshot: true,
                    agentNameSnapshot: true,
                    sourceGroupSnapshot: true,
                    whatsappGroupUrlSnapshot: true,
                    user: {
                        select: {
                            id: true,
                            role: true,
                            balance: true,
                        },
                    },
                },
            })

            if (!creditRequest) {
                throw new CreditRequestDecisionError('Credit request not found', 404)
            }

            if (!canActorManageCreditRequest(authResult.user, creditRequest)) {
                throw new CreditRequestDecisionError('You do not have permission to decide this credit request', 403)
            }

            if (creditRequest.status !== 'PENDING') {
                throw new CreditRequestDecisionError('Credit request is no longer pending', 409)
            }

            await lockCreditDebtUser(tx, creditRequest.userId)
            const debtSummaryBefore = await getCreditDebtSummary(tx, creditRequest.userId)
            if (parsed.data.decision === 'APPROVE') {
                const capacity = canApproveReservedCredit(debtSummaryBefore)
                if (!capacity.allowed) {
                    throw new CreditRequestDecisionError(
                        capacity.reason === 'CREDIT_LIMIT_NOT_CONFIGURED'
                            ? 'Credit request limit is not configured for this user'
                            : 'Credit request exceeds this user credit limit',
                        400
                    )
                }
            }

            const guardedUpdate = await tx.creditRequest.updateMany({
                where: {
                    id: creditRequest.id,
                    status: 'PENDING',
                    transactionId: null,
                },
                data: {
                    status: nextStatus,
                    decidedAt: new Date(),
                    decidedByAdminId: authResult.user.id,
                    decisionNote: note,
                },
            })

            if (guardedUpdate.count !== 1) {
                throw new CreditRequestDecisionError('Credit request was already decided', 409)
            }

            let balanceTransactionId: string | null = null
            const pointsCreated: Array<{
                ownerRole: 'USER' | 'AGENT'
                ownerUserId: string
                points: number
                status: 'PENDING'
                ratePerThousandSnapshot: number
            }> = []

            if (parsed.data.decision === 'APPROVE') {
                const updatedUser = await tx.user.update({
                    where: { id: creditRequest.userId },
                    data: { balance: { increment: creditRequest.amountUsd } },
                    select: { balance: true },
                })
                const balanceBefore = updatedUser.balance - creditRequest.amountUsd
                const transaction = await tx.transaction.create({
                    data: {
                        userId: creditRequest.userId,
                        adminId: authResult.user.id,
                        amount: creditRequest.amountUsd,
                        balanceAfter: updatedUser.balance,
                        type: 'DEPOSIT',
                        notes: buildDecisionNote(parsed.data.decision, creditRequest.requestNumber, note),
                    },
                    select: { id: true },
                })

                await tx.creditRequest.update({
                    where: { id: creditRequest.id },
                    data: { transactionId: transaction.id },
                })
                balanceTransactionId = transaction.id
                const debtAfterUsd = normalizeMoney(debtSummaryBefore.outstandingDebtUsd + creditRequest.amountUsd)

                await tx.creditDebtLedgerEntry.create({
                    data: {
                        userId: creditRequest.userId,
                        entryType: 'CREDIT_APPROVED',
                        amountUsd: creditRequest.amountUsd,
                        debtAfterUsd,
                        creditRequestId: creditRequest.id,
                        transactionId: transaction.id,
                        ownerTypeSnapshot: creditRequest.ownerTypeSnapshot,
                        ownerIdSnapshot: creditRequest.ownerIdSnapshot || creditRequest.agentIdSnapshot,
                        ownerLabelSnapshot: creditRequest.ownerLabelSnapshot || creditRequest.agentNameSnapshot,
                        recordedByUserId: authResult.user.id,
                        note: buildDecisionNote(parsed.data.decision, creditRequest.requestNumber, note),
                    },
                })

                await tx.creditRequestStatusHistory.create({
                    data: {
                        creditRequestId: creditRequest.id,
                        fromStatus: 'PENDING',
                        toStatus: nextStatus,
                        actorId: authResult.user.id,
                        actorRole: authResult.user.role,
                        note: buildDecisionNote(parsed.data.decision, creditRequest.requestNumber, note),
                    },
                })

                const whatsappHandoff = await createWhatsAppHandoffSnapshot(tx, {
                    creditRequestId: creditRequest.id,
                    requestNumber: creditRequest.requestNumber,
                    username: creditRequest.usernameSnapshot,
                    amountUsd: creditRequest.amountUsd,
                    ownerType: creditRequest.ownerTypeSnapshot || (creditRequest.agentIdSnapshot ? 'AGENT' : null),
                    agentId: creditRequest.agentIdSnapshot,
                    agentName: creditRequest.agentNameSnapshot,
                    sourceGroup: creditRequest.sourceGroupSnapshot,
                    whatsappGroupUrl: creditRequest.whatsappGroupUrlSnapshot,
                    userId: creditRequest.userId,
                    adminId: authResult.user.id,
                })

                await tx.activityLog.create({
                    data: {
                        userId: authResult.user.id,
                        action: 'ADMIN_CREDIT_REQUEST_WHATSAPP_HANDOFF_CREATED',
                        targetId: creditRequest.id,
                        targetType: 'CreditRequest',
                        details: {
                            requestNumber: creditRequest.requestNumber,
                            destinationLabel: whatsappHandoff.destinationLabel,
                            groupOpenAvailable: whatsappHandoff.groupOpenAvailable,
                            phoneOpenAvailable: whatsappHandoff.phoneOpenAvailable,
                        },
                        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                        userAgent: request.headers.get('user-agent'),
                    },
                })

                return {
                    requestStatus: nextStatus,
                    balanceTransactionId,
                    balanceBefore,
                    balanceAfter: updatedUser.balance,
                    pointsCreated,
                    whatsappHandoff,
                }
            }

            await tx.creditRequestStatusHistory.create({
                data: {
                    creditRequestId: creditRequest.id,
                    fromStatus: 'PENDING',
                    toStatus: nextStatus,
                    actorId: authResult.user.id,
                    actorRole: authResult.user.role,
                    note: buildDecisionNote(parsed.data.decision, creditRequest.requestNumber, note),
                },
            })

            return {
                requestStatus: nextStatus,
                balanceTransactionId,
                balanceBefore: null,
                balanceAfter: null,
                pointsCreated,
                whatsappHandoff: null,
            }
        })

        return NextResponse.json({
            success: true,
            ...result,
        })
    } catch (error) {
        if (error instanceof CreditRequestDecisionError) {
            return NextResponse.json({ error: error.message }, { status: error.status })
        }

        console.error('Admin decide credit request error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
