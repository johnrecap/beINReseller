import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { z } from 'zod'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

const toggleActiveSchema = z.object({
    isActive: z.boolean()
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

        // Check if user exists
        const targetUser = await prisma.user.findUnique({ where: { id } })
        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (targetUser.deletedAt) {
            return NextResponse.json({ error: 'Cannot edit a deleted user' }, { status: 400 })
        }

        // Check if this user belongs to this manager
        const managerUserLink = await prisma.managerUser.findFirst({
            where: {
                managerId: manager.id,
                userId: id
            }
        })

        if (!managerUserLink) {
            return NextResponse.json({ error: 'You do not have permission to edit this user' }, { status: 403 })
        }

        const body = await request.json()
        const result = toggleActiveSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { isActive } = result.data

        // Update user active status
        const updatedUser = await prisma.user.update({
            where: { id },
            data: { isActive }
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: manager.id,
                action: isActive ? 'MANAGER_ACTIVATE_USER' : 'MANAGER_DEACTIVATE_USER',
                details: {
                    targetUsername: targetUser.username,
                    targetUserId: id,
                    newStatus: isActive
                },
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({
            success: true,
            message: isActive ? 'User activated successfully' : 'User deactivated successfully',
            isActive: updatedUser.isActive
        })

    } catch (error) {
        console.error('Manager toggle user active error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function DELETE(
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

        // Check if user exists
        const userToDelete = await prisma.user.findUnique({ where: { id } })
        if (!userToDelete) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (userToDelete.deletedAt) {
            return NextResponse.json({ error: 'User already deleted' }, { status: 400 })
        }

        // Check if this user belongs to this manager
        const managerUserLink = await prisma.managerUser.findFirst({
            where: {
                managerId: manager.id,
                userId: id
            }
        })

        if (!managerUserLink) {
            return NextResponse.json({ error: 'You do not have permission to delete this user' }, { status: 403 })
        }

        const refundedBalance = userToDelete.balance

        // Use transaction to ensure data integrity
        await prisma.$transaction(async (tx) => {
            // 1. Refund balance to manager if user has balance > 0
            if (refundedBalance > 0) {
                // Add balance back to manager
                const updatedManager = await tx.user.update({
                    where: { id: manager.id },
                    data: { balance: { increment: refundedBalance } }
                })

                // Log transaction for manager (receiving refund)
                await tx.transaction.create({
                    data: {
                        userId: manager.id,
                        type: 'DEPOSIT',
                        amount: refundedBalance,
                        notes: `Balance refund from user deletion: ${userToDelete.username}`,
                        balanceAfter: updatedManager.balance
                    }
                })

                // Log transaction for deleted user (withdrawal)
                await tx.transaction.create({
                    data: {
                        userId: userToDelete.id,
                        type: 'WITHDRAW',
                        amount: refundedBalance,
                        notes: `Balance deducted due to account deletion`,
                        balanceAfter: 0
                    }
                })
            }

            // 2. Soft delete - preserve data and mark as deleted
            await tx.user.update({
                where: { id },
                data: {
                    deletedAt: new Date(),
                    deletedBalance: refundedBalance,
                    deletedByUserId: manager.id,
                    isActive: false,
                    balance: 0  // Clear user's balance after refund
                }
            })

            // 3. Log activity with detailed info
            await tx.activityLog.create({
                data: {
                    userId: manager.id,
                    action: 'MANAGER_DELETE_USER',
                    details: {
                        deletedUsername: userToDelete.username,
                        deletedUserId: userToDelete.id,
                        refundedBalance: refundedBalance,
                        refundedToManager: refundedBalance > 0
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })
        })

        return NextResponse.json({ 
            success: true, 
            message: refundedBalance > 0 
                ? `User deleted successfully and $${refundedBalance.toFixed(2)} refunded to your balance`
                : 'User deleted successfully'
        })

    } catch (error) {
        console.error('Manager delete user error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
