import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import {
    canRequestCreditForOwner,
    findPendingCreditRequestForUser,
} from '@/lib/credit-requests/permissions'
import {
    createCreditRequestSchema,
} from '@/lib/credit-requests/types'
import { sendCreditRequestTelegramNotification } from '@/lib/credit-requests/notifications'
import { getCreditRequestAccess } from '@/lib/credit-requests/access'

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

function duplicatePendingResponse(existing: {
    id: string
    requestNumber: string
    amountUsd: number
    paymentMethod: string
    status: string
    createdAt: Date
}) {
    return NextResponse.json(
        {
            error: 'You already have a pending credit request',
            reason: 'PENDING_REQUEST_EXISTS',
            existingRequest: {
                id: existing.id,
                requestNumber: existing.requestNumber,
                amountUsd: existing.amountUsd,
                paymentMethod: existing.paymentMethod,
                status: existing.status,
                createdAt: existing.createdAt.toISOString(),
            },
        },
        { status: 409 }
    )
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
                canRequest: eligibilityReason === 'ELIGIBLE',
                reason: eligibilityReason,
                ownerType: owner.ownerType,
                ownerLabel: owner.ownerLabel,
                agentName,
                sourceGroup,
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
        const existingPending = await findPendingCreditRequestForUser(prisma, user.id)

        if (existingPending) {
            return duplicatePendingResponse(existingPending)
        }

        let creditRequest: Prisma.CreditRequestGetPayload<Prisma.CreditRequestDefaultArgs>
        try {
            creditRequest = await prisma.$transaction(async (tx) => {
                const pendingInsideTransaction = await findPendingCreditRequestForUser(tx, user.id)
                if (pendingInsideTransaction) {
                    throw Object.assign(new Error('PENDING_REQUEST_EXISTS'), {
                        existingPending: pendingInsideTransaction,
                    })
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

                return created
            })
        } catch (error) {
            const existingPending = (error as { existingPending?: Awaited<ReturnType<typeof findPendingCreditRequestForUser>> }).existingPending
            if (existingPending) {
                return duplicatePendingResponse(existingPending)
            }

            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const existing = await findPendingCreditRequestForUser(prisma, user.id)
                if (existing) {
                    return duplicatePendingResponse(existing)
                }
            }

            throw error
        }

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
            notification: {
                attempted: notification.attempted,
                provider: notification.provider,
                targetType: notification.targetType,
                targetLabel: notification.targetLabel,
                status: notification.status,
            },
        })
    } catch (error) {
        console.error('Create credit request error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
