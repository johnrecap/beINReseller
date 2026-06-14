import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import {
    canRequestCreditForOwner,
} from '@/lib/credit-requests/permissions'
import {
    createCreditRequestSchema,
} from '@/lib/credit-requests/types'
import { sendCreditRequestTelegramNotification } from '@/lib/credit-requests/notifications'
import { getCreditRequestAccess } from '@/lib/credit-requests/access'
import {
    getCreditDebtSummary,
    lockCreditDebtUser,
    validateCreditRequestCapacity,
} from '@/lib/credit-requests/debt'

function toDatePart(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}${month}${day}`
}

function createRequestNumber(date = new Date()): string {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
    return `CR-${toDatePart(date)}-${suffix}`
}

class CreditRequestCapacityError extends Error {
    constructor(
        readonly reason: 'CREDIT_LIMIT_NOT_CONFIGURED' | 'CREDIT_LIMIT_EXCEEDED',
        readonly availableUsd: number
    ) {
        super(reason)
    }
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const {
            user,
            owner,
            eligibilityReason,
            agentName,
            sourceGroup,
        } = await getCreditRequestAccess(authResult.user.id)
        if (!user || !owner) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const debtSummary = await getCreditDebtSummary(prisma, authResult.user.id)
        const capacityReason = eligibilityReason === 'ELIGIBLE'
            ? !debtSummary.hasLimit
                ? 'CREDIT_LIMIT_NOT_CONFIGURED'
                : debtSummary.availableUsd <= 0
                    ? 'CREDIT_LIMIT_EXCEEDED'
                    : null
            : null

        const requests = await prisma.creditRequest.findMany({
            where: { userId: authResult.user.id },
            orderBy: { createdAt: 'desc' },
            take: 25,
            select: {
                id: true,
                requestNumber: true,
                status: true,
                amountUsd: true,
                paymentMethod: true,
                ownerTypeSnapshot: true,
                ownerLabelSnapshot: true,
                agentNameSnapshot: true,
                sourceGroupSnapshot: true,
                createdAt: true,
                notifications: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { status: true },
                },
            },
        })

        return NextResponse.json({
            eligibility: {
                canRequest: eligibilityReason === 'ELIGIBLE' && !capacityReason,
                reason: capacityReason || eligibilityReason,
                ownerType: owner.ownerType,
                ownerLabel: owner.ownerLabel,
                agentName,
                sourceGroup,
                debtSummary,
            },
            requests: requests.map((item) => ({
                id: item.id,
                requestNumber: item.requestNumber,
                status: item.status,
                amountUsd: item.amountUsd,
                paymentMethod: item.paymentMethod,
                ownerType: item.ownerTypeSnapshot,
                ownerLabel: item.ownerLabelSnapshot,
                agentName: item.agentNameSnapshot,
                sourceGroup: item.sourceGroupSnapshot,
                createdAt: item.createdAt.toISOString(),
                notificationStatus: item.notifications[0]?.status,
            })),
        })
    } catch (error) {
        console.error('List credit requests error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = createCreditRequestSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const {
            user,
            activeAgentAssignment,
            owner,
            eligibilityReason,
            agentName,
            sourceGroup,
        } = await getCreditRequestAccess(authResult.user.id)
        if (!user || !owner) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const eligible = canRequestCreditForOwner({
            user,
            owner,
        })

        if (!eligible || (owner.ownerType === 'AGENT' && !activeAgentAssignment)) {
            return NextResponse.json(
                {
                    error: 'Credit request is not available for this account',
                    reason: eligibilityReason,
                },
                { status: 403 }
            )
        }

        const ownerLabel = owner.ownerLabel
            || (owner.ownerType === 'ADMIN' || owner.ownerType === 'LEGACY_ADMIN' ? 'Admin direct' : null)
            || agentName
        const requestNumber = createRequestNumber()
        const notes = parsed.data.notes?.trim() || null

        const { creditRequest, debtSummary } = await prisma.$transaction(async (tx) => {
            await lockCreditDebtUser(tx, user.id)
            const debtSummaryBefore = await getCreditDebtSummary(tx, user.id)
            const capacity = validateCreditRequestCapacity(debtSummaryBefore, parsed.data.amountUsd)
            if (!capacity.allowed) {
                throw new CreditRequestCapacityError(capacity.reason, capacity.availableUsd)
            }

            const created = await tx.creditRequest.create({
                data: {
                    requestNumber,
                    userId: user.id,
                    usernameSnapshot: user.username,
                    amountUsd: parsed.data.amountUsd,
                    paymentMethod: parsed.data.paymentMethod,
                    notes,
                    ownerTypeSnapshot: owner.ownerType,
                    ownerIdSnapshot: owner.ownerId,
                    ownerLabelSnapshot: ownerLabel,
                    agentIdSnapshot: activeAgentAssignment?.agentId || null,
                    agentNameSnapshot: agentName,
                    sourceGroupSnapshot: activeAgentAssignment?.sourceGroup || null,
                    whatsappGroupUrlSnapshot: activeAgentAssignment?.whatsappGroupUrl || null,
                    status: 'PENDING',
                },
            })

            await tx.creditRequestStatusHistory.create({
                data: {
                    creditRequestId: created.id,
                    fromStatus: null,
                    toStatus: 'PENDING',
                    actorId: user.id,
                    actorRole: user.role,
                    note: 'Credit request created',
                },
            })

            return {
                creditRequest: created,
                debtSummary: await getCreditDebtSummary(tx, user.id),
            }
        })

        const notification = await sendCreditRequestTelegramNotification({
            creditRequestId: creditRequest.id,
            requestNumber: creditRequest.requestNumber,
            username: user.username,
            amountUsd: creditRequest.amountUsd,
            paymentMethod: creditRequest.paymentMethod,
            ownerType: owner.ownerType,
            ownerLabel,
            agentId: activeAgentAssignment?.agentId || null,
            agentName,
            sourceGroup,
        })

        return NextResponse.json({
            success: true,
            request: {
                id: creditRequest.id,
                requestNumber: creditRequest.requestNumber,
                status: creditRequest.status,
                amountUsd: creditRequest.amountUsd,
                paymentMethod: creditRequest.paymentMethod,
                ownerType: owner.ownerType,
                ownerLabel,
                agentName,
                sourceGroup,
                createdAt: creditRequest.createdAt.toISOString(),
            },
            debtSummary,
            notification: {
                attempted: notification.attempted,
                provider: notification.provider,
                targetType: notification.targetType,
                targetLabel: notification.targetLabel,
                status: notification.status,
            },
        })
    } catch (error) {
        if (error instanceof CreditRequestCapacityError) {
            return NextResponse.json(
                {
                    error: error.reason === 'CREDIT_LIMIT_NOT_CONFIGURED'
                        ? 'Credit request limit is not configured for this account'
                        : 'Credit request exceeds your available credit limit',
                    reason: error.reason,
                    availableUsd: error.availableUsd,
                },
                { status: 400 }
            )
        }
        console.error('Create credit request error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
