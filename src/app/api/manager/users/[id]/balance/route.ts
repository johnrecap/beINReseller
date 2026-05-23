import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { z } from 'zod'
import { createNotification } from '@/lib/notification'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import {
    calculatePoints,
    getManagerTopupRate,
    hasPositivePoints,
} from '@/lib/credit-requests/points'

const balanceSchema = z.object({
    amount: z.number().refine(val => val !== 0, 'Amount must be greater or less than zero'),
    notes: z.string().optional(),
})

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authResult = await requireRoleAPIWithMobile(request, 'MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: manager } = authResult

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `manager:${manager.id}`,
            RATE_LIMITS.manager
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        // Check if user exists and belongs to this manager
        const targetUser = await prisma.user.findUnique({ where: { id } })
        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (targetUser.deletedAt) {
            return NextResponse.json({ error: 'Cannot modify balance for a deleted user' }, { status: 400 })
        }

        // Check if this user belongs to this manager
        const managerUserLink = await prisma.managerUser.findFirst({
            where: {
                managerId: manager.id,
                userId: id
            }
        })

        if (!managerUserLink) {
            return NextResponse.json({ error: 'You do not have permission to modify this user\'s balance' }, { status: 403 })
        }

        const body = await request.json()
        const result = balanceSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { amount, notes } = result.data
        const isDeposit = amount > 0
        const absAmount = Math.abs(amount)

        // Transactional update with balance checks INSIDE transaction (prevents race conditions)
        try {
            const updatedUser = await prisma.$transaction(async (tx) => {
                let updatedManager: { balance: number }
                let updated: { balance: number }

                // 1. For deposits, debit manager with a DB guard before crediting user.
                if (isDeposit) {
                    const managerDebit = await tx.user.updateMany({
                        where: {
                            id: manager.id,
                            balance: { gte: absAmount }
                        },
                        data: { balance: { decrement: absAmount } }
                    })

                    if (managerDebit.count !== 1) {
                        const currentManager = await tx.user.findUnique({
                            where: { id: manager.id },
                            select: { balance: true }
                        })
                        throw new Error(`INSUFFICIENT_MANAGER_BALANCE:${currentManager?.balance.toFixed(2) || 0}`)
                    }

                    updatedManager = await tx.user.findUniqueOrThrow({
                        where: { id: manager.id },
                        select: { balance: true }
                    })

                    updated = await tx.user.update({
                        where: { id },
                        data: { balance: { increment: absAmount } },
                        select: { balance: true }
                    })
                } else {
                    // 2. For withdrawals, debit user with a DB guard before crediting manager.
                    const userDebit = await tx.user.updateMany({
                        where: {
                            id,
                            balance: { gte: absAmount }
                        },
                        data: { balance: { decrement: absAmount } }
                    })

                    if (userDebit.count !== 1) {
                        const currentUser = await tx.user.findUnique({
                            where: { id },
                            select: { balance: true }
                        })
                        throw new Error(`INSUFFICIENT_USER_BALANCE:${currentUser?.balance.toFixed(2) || 0}`)
                    }

                    updated = await tx.user.findUniqueOrThrow({
                        where: { id },
                        select: { balance: true }
                    })

                    updatedManager = await tx.user.update({
                        where: { id: manager.id },
                        data: { balance: { increment: absAmount } },
                        select: { balance: true }
                    })
                }

                // 5. Create transaction for user
                const userTransaction = await tx.transaction.create({
                    data: {
                        userId: id,
                        type: isDeposit ? 'DEPOSIT' : 'WITHDRAW',
                        amount: absAmount,
                        balanceAfter: updated.balance,
                        notes: notes || (isDeposit ? 'Balance deposit by manager' : 'Balance withdrawal by manager'),
                        adminId: manager.id
                    },
                    select: { id: true },
                })

                // 6. Create transaction for manager
                await tx.transaction.create({
                    data: {
                        userId: manager.id,
                        type: isDeposit ? 'WITHDRAW' : 'DEPOSIT',
                        amount: absAmount,
                        balanceAfter: updatedManager.balance,
                        notes: isDeposit 
                            ? `Balance transfer to user: ${targetUser.username}`
                            : `Balance refund from user: ${targetUser.username}`,
                    }
                })

                if (isDeposit) {
                    const managerRate = await getManagerTopupRate(tx, manager.id)
                    const managerPoints = calculatePoints({
                        ownerKind: 'MANAGER',
                        amountUsd: absAmount,
                        pointsPerThousand: managerRate,
                    })

                    if (hasPositivePoints(managerPoints)) {
                        await tx.pointLedgerEntry.create({
                            data: {
                                ownerUserId: manager.id,
                                ownerRoleAtTime: 'MANAGER',
                                sourceType: 'MANAGER_TOPUP',
                                sourceId: userTransaction.id,
                                points: managerPoints.points,
                                status: 'PENDING',
                                ratePerThousandSnapshot: managerPoints.ratePerThousandSnapshot,
                                amountUsdSnapshot: managerPoints.amountUsdSnapshot,
                                createdById: manager.id,
                                notes: `Pending manager points for top-up to ${targetUser.username}`,
                            },
                        })
                    }
                }

                // 7. Log activity
                await tx.activityLog.create({
                    data: {
                        userId: manager.id,
                        action: isDeposit ? 'MANAGER_DEPOSIT_USER' : 'MANAGER_WITHDRAW_USER',
                        details: {
                            targetUsername: targetUser.username,
                            targetUserId: id,
                            amount: absAmount,
                            managerNewBalance: updatedManager.balance,
                            userNewBalance: updated.balance,
                            notes: notes || null
                        },
                        ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                    }
                })

                // 8. Notify user
                await createNotification({
                    userId: id,
                    title: isDeposit ? 'Balance added' : 'Balance withdrawn',
                    message: isDeposit 
                        ? `$${absAmount.toFixed(2)} added to your balance. Current balance: $${updated.balance.toFixed(2)}`
                        : `$${absAmount.toFixed(2)} withdrawn from your balance. Current balance: $${updated.balance.toFixed(2)}`,
                    type: isDeposit ? 'success' : 'warning',
                    link: '/dashboard/transactions'
                }, tx)

                return updated
            })

            return NextResponse.json({
                success: true,
                message: isDeposit 
                    ? `$${absAmount.toFixed(2)} deposited successfully`
                    : `$${absAmount.toFixed(2)} withdrawn successfully`,
                newBalance: updatedUser.balance
            })

        } catch (error) {
            // Handle custom balance errors
            if (error instanceof Error) {
                if (error.message.startsWith('INSUFFICIENT_MANAGER_BALANCE:')) {
                    const balance = error.message.split(':')[1]
                    return NextResponse.json(
                        { error: `Insufficient balance. Your current balance: $${balance}` },
                        { status: 400 }
                    )
                }
                if (error.message.startsWith('INSUFFICIENT_USER_BALANCE:')) {
                    const balance = error.message.split(':')[1]
                    return NextResponse.json(
                        { error: `Insufficient user balance. Current balance: $${balance}` },
                        { status: 400 }
                    )
                }
            }
            throw error
        }

    } catch (error) {
        console.error('Manager balance update error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
