import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { createNotification } from '@/lib/notification'

const addBalanceSchema = z.object({
    amount: z.number().refine(val => val !== 0, 'Amount cannot be zero'),
    notes: z.string().optional(),
})

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        const adminUser = authResult.user

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `admin:${adminUser.id}`,
            RATE_LIMITS.admin
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        const body = await request.json()
        const result = addBalanceSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { amount, notes } = result.data

        const isWithdrawal = amount < 0

        // Transactional update
        const user = await prisma.$transaction(async (tx) => {
            // 1. Get current user
            const currentUser = await tx.user.findUnique({
                where: { id },
                select: { id: true, username: true }
            })

            if (!currentUser) throw new Error('User not found')

            // 2. Update balance with a DB guard so concurrent withdrawals cannot overdraw.
            let updatedUser: { id: string; username: string; balance: number }
            if (isWithdrawal) {
                const withdrawal = Math.abs(amount)
                const debitResult = await tx.user.updateMany({
                    where: {
                        id,
                        balance: { gte: withdrawal },
                    },
                    data: { balance: { decrement: withdrawal } }
                })

                if (debitResult.count !== 1) {
                    throw new Error('INSUFFICIENT_BALANCE')
                }

                updatedUser = await tx.user.findUniqueOrThrow({
                    where: { id },
                    select: { id: true, username: true, balance: true }
                })
            } else {
                updatedUser = await tx.user.update({
                    where: { id },
                    data: { balance: { increment: amount } },
                    select: { id: true, username: true, balance: true }
                })
            }

            // 4. Create Transaction Record
            await tx.transaction.create({
                data: {
                    userId: id,
                    type: isWithdrawal ? 'WITHDRAW' : 'DEPOSIT',
                    amount: amount,
                    balanceAfter: updatedUser.balance,
                    notes: notes || (isWithdrawal ? 'Balance withdrawn by admin' : 'Balance top-up by admin'),
                    adminId: adminUser.id
                }
            })

            // 5. Log Activity
            await tx.activityLog.create({
                data: {
                    userId: adminUser.id,
                    action: isWithdrawal ? 'MANAGER_WITHDRAW_USER' : 'ADMIN_ADD_BALANCE',
                    details: isWithdrawal
                        ? `Withdrew ${Math.abs(amount)} from user ${currentUser.username}`
                        : `Added ${amount} to user ${currentUser.username}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })

            // 6. Notify User
            await createNotification({
                userId: id,
                title: isWithdrawal ? 'Balance withdrawn' : 'Balance added',
                message: isWithdrawal
                    ? `${Math.abs(amount)} was withdrawn from your balance. Current balance: ${updatedUser.balance}`
                    : `${amount} was added to your balance. Current balance: ${updatedUser.balance}`,
                type: isWithdrawal ? 'warning' : 'success',
                link: '/dashboard/history'
            })

            return updatedUser
        })

        return NextResponse.json({
            success: true,
            message: isWithdrawal ? 'Balance withdrawn successfully' : 'Balance added successfully',
            newBalance: user.balance
        })

    } catch (error) {
        if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
            return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
        }

        if (error instanceof Error && error.message === 'User not found') {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        console.error('Add balance error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
