import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import {
    canActorManageCreditDebt,
    canActorSetCreditDebtLimit,
} from '@/lib/credit-requests/permissions'
import {
    calculateDebtAfterPayment,
    getCreditDebtSummary,
    lockCreditDebtUser,
} from '@/lib/credit-requests/debt'
import { classifyCurrentUserOwner } from '@/lib/users/ownership'

const limitSchema = z.object({
    creditDebtLimitUsd: z.coerce.number().finite().min(0).max(1000000),
})

const paymentSchema = z.object({
    amountUsd: z.coerce.number().finite().positive().max(1000000),
    note: z.string().trim().max(500).optional().or(z.literal('')),
})

type DebtTargetDb = Pick<Prisma.TransactionClient, 'user'>

async function loadDebtTarget(db: DebtTargetDb, userId: string) {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            role: true,
            isActive: true,
            deletedAt: true,
            creditDebtLimitUsd: true,
            createdBy: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                },
            },
            managerLink: {
                select: {
                    id: true,
                    managerId: true,
                    manager: {
                        select: {
                            id: true,
                            username: true,
                            role: true,
                            isActive: true,
                            deletedAt: true,
                        },
                    },
                },
            },
            agentAssignmentAsUser: {
                where: { isActive: true },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    agentId: true,
                    isActive: true,
                    sourceGroup: true,
                    whatsappGroupUrl: true,
                    agent: {
                        select: {
                            id: true,
                            username: true,
                            role: true,
                            isActive: true,
                            deletedAt: true,
                            agentProfile: {
                                select: {
                                    displayName: true,
                                    isActive: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    })

    if (!user) return null

    return {
        user,
        owner: classifyCurrentUserOwner({
            user,
            managerLinks: user.managerLink,
            activeAssignments: user.agentAssignmentAsUser,
        }),
    }
}

async function loadDebtResponse(userId: string) {
    const [summary, entries] = await Promise.all([
        getCreditDebtSummary(prisma, userId),
        prisma.creditDebtLedgerEntry.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                entryType: true,
                amountUsd: true,
                debtAfterUsd: true,
                note: true,
                createdAt: true,
                recordedBy: {
                    select: { id: true, username: true },
                },
            },
        }),
    ])

    return {
        summary,
        entries: entries.map((entry) => ({
            id: entry.id,
            entryType: entry.entryType,
            amountUsd: entry.amountUsd,
            debtAfterUsd: entry.debtAfterUsd,
            note: entry.note,
            createdAt: entry.createdAt.toISOString(),
            recordedBy: entry.recordedBy,
        })),
    }
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId } = await context.params
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const target = await loadDebtTarget(prisma, userId)
        if (!target) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const canRead = authResult.user.id === userId
            || canActorManageCreditDebt(authResult.user, target.owner)
        if (!canRead) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
        }

        return NextResponse.json({
            user: {
                id: target.user.id,
                username: target.user.username,
                creditDebtLimitUsd: target.user.creditDebtLimitUsd,
            },
            owner: target.owner,
            ...(await loadDebtResponse(userId)),
        })
    } catch (error) {
        console.error('Load credit debt error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId } = await context.params
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        if (!canActorSetCreditDebtLimit(authResult.user)) {
            return NextResponse.json({ error: 'Only admins can update credit request limits' }, { status: 403 })
        }

        const body = await request.json().catch(() => null)
        const parsed = limitSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid credit limit data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        await prisma.$transaction(async (tx) => {
            await lockCreditDebtUser(tx, userId)
            const updated = await tx.user.updateMany({
                where: { id: userId, role: 'USER', deletedAt: null },
                data: { creditDebtLimitUsd: parsed.data.creditDebtLimitUsd },
            })
            if (updated.count !== 1) {
                throw new Error('TARGET_USER_NOT_FOUND')
            }

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_UPDATE_CREDIT_DEBT_LIMIT',
                    targetId: userId,
                    targetType: 'User',
                    details: { creditDebtLimitUsd: parsed.data.creditDebtLimitUsd },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    userAgent: request.headers.get('user-agent'),
                },
            })
        })

        return NextResponse.json({
            success: true,
            ...(await loadDebtResponse(userId)),
        })
    } catch (error) {
        if (error instanceof Error && error.message === 'TARGET_USER_NOT_FOUND') {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        console.error('Update credit debt limit error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId } = await context.params
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = paymentSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid payment data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        await prisma.$transaction(async (tx) => {
            await lockCreditDebtUser(tx, userId)

            const target = await loadDebtTarget(tx, userId)
            if (!target || target.user.role !== 'USER') {
                throw new Error('TARGET_USER_NOT_FOUND')
            }
            if (!canActorManageCreditDebt(authResult.user, target.owner)) {
                throw new Error('CREDIT_DEBT_FORBIDDEN')
            }

            const summary = await getCreditDebtSummary(tx, userId)
            const payment = calculateDebtAfterPayment(summary, parsed.data.amountUsd)
            if (!payment.allowed) {
                throw new Error(payment.reason)
            }

            await tx.creditDebtLedgerEntry.create({
                data: {
                    userId,
                    entryType: 'PAYMENT_RECORDED',
                    amountUsd: parsed.data.amountUsd,
                    debtAfterUsd: payment.debtAfterUsd,
                    ownerTypeSnapshot: target.owner.ownerType,
                    ownerIdSnapshot: target.owner.ownerId,
                    ownerLabelSnapshot: target.owner.ownerLabel,
                    recordedByUserId: authResult.user.id,
                    note: parsed.data.note?.trim() || null,
                },
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'CREDIT_DEBT_PAYMENT_RECORDED',
                    targetId: userId,
                    targetType: 'User',
                    details: {
                        amountUsd: parsed.data.amountUsd,
                        debtAfterUsd: payment.debtAfterUsd,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    userAgent: request.headers.get('user-agent'),
                },
            })
        })

        return NextResponse.json({
            success: true,
            ...(await loadDebtResponse(userId)),
        })
    } catch (error) {
        if (error instanceof Error && error.message === 'TARGET_USER_NOT_FOUND') {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }
        if (error instanceof Error && error.message === 'CREDIT_DEBT_FORBIDDEN') {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
        }
        if (error instanceof Error && error.message === 'PAYMENT_EXCEEDS_DEBT') {
            return NextResponse.json({ error: 'Payment exceeds outstanding debt' }, { status: 400 })
        }
        if (error instanceof Error && error.message === 'INVALID_PAYMENT_AMOUNT') {
            return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })
        }

        console.error('Record credit debt payment error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
