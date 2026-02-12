import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { z } from 'zod'
import { createNotification } from '@/lib/notification'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

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
                // 1. Check manager balance for deposit (INSIDE transaction)
                if (isDeposit) {
                    const currentManager = await tx.user.findUnique({
                        where: { id: manager.id },
                        select: { balance: true }
                    })

                    if (!currentManager || currentManager.balance < absAmount) {
                        throw new Error(`INSUFFICIENT_MANAGER_BALANCE:${currentManager?.balance.toFixed(2) || 0}`)
                    }
                }

                // 2. Check user balance for withdraw (INSIDE transaction)
                if (!isDeposit) {
                    const currentUser = await tx.user.findUnique({
                        where: { id },
                        select: { balance: true }
                    })

                    if (!currentUser || currentUser.balance < absAmount) {
                        throw new Error(`INSUFFICIENT_USER_BALANCE:${currentUser?.balance.toFixed(2) || 0}`)
                    }
                }

                // 3. Update user balance
                const updated = await tx.user.update({
                    where: { id },
                    data: { balance: { increment: amount } }
                })

                // 4. Update manager balance (opposite direction)
                const updatedManager = await tx.user.update({
                    where: { id: manager.id },
                    data: { balance: { increment: -amount } }
                })

                // 5. Create transaction for user
                await tx.transaction.create({
                    data: {
                        userId: id,
                        type: isDeposit ? 'DEPOSIT' : 'WITHDRAW',
                        amount: absAmount,
                        balanceAfter: updated.balance,
                        notes: notes || (isDeposit ? 'Balance deposit by manager' : 'Balance withdrawal by manager'),
                        adminId: manager.id
                    }
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
                })

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
