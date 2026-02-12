import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { createNotification } from '@/lib/notification'

const addBalanceSchema = z.object({
    amount: z.number().min(1, 'Amount must be greater than 0'),
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

        // Transactional update
        const user = await prisma.$transaction(async (tx) => {
            // 1. Get current user
            const currentUser = await tx.user.findUnique({
                where: { id }
            })

            if (!currentUser) throw new Error('User not found')

            // 2. Update balance
            const updatedUser = await tx.user.update({
                where: { id },
                data: { balance: { increment: amount } }
            })

// 3. Create Transaction Record
            await tx.transaction.create({
                data: {
                    userId: id,
                    type: 'DEPOSIT',
                    amount: amount,
                    balanceAfter: updatedUser.balance,
                    notes: notes || 'Balance top-up by admin',
                    adminId: adminUser.id
                }
            })

            // 4. Log Activity
            await tx.activityLog.create({
                data: {
                    userId: adminUser.id,
                    action: 'ADMIN_ADD_BALANCE',
                    details: `Added ${amount} to user ${currentUser.username}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })

            // 5. Notify User
            await createNotification({
                userId: id,
                title: 'Balance added',
                message: `Added ${amount} to your balance. Current balance: ${updatedUser.balance}`,
                type: 'success',
                link: '/dashboard/history'
            })

            return updatedUser
        })

        return NextResponse.json({
            success: true,
            message: 'Balance added successfully',
            newBalance: user.balance
        })

    } catch (error) {
        console.error('Add balance error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
