import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPI } from '@/lib/auth-utils'
import { z } from 'zod'
import { createNotification } from '@/lib/notification'

const balanceSchema = z.object({
    amount: z.number().refine(val => val !== 0, 'المبلغ يجب أن يكون أكبر أو أقل من صفر'),
    notes: z.string().optional(),
})

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authResult = await requireRoleAPI('MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: manager } = authResult

        // Check if user exists and belongs to this manager
        const targetUser = await prisma.user.findUnique({ where: { id } })
        if (!targetUser) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        if (targetUser.deletedAt) {
            return NextResponse.json({ error: 'لا يمكن تعديل رصيد مستخدم محذوف' }, { status: 400 })
        }

        // Check if this user belongs to this manager
        const managerUserLink = await prisma.managerUser.findFirst({
            where: {
                managerId: manager.id,
                userId: id
            }
        })

        if (!managerUserLink) {
            return NextResponse.json({ error: 'ليس لديك صلاحية تعديل رصيد هذا المستخدم' }, { status: 403 })
        }

        const body = await request.json()
        const result = balanceSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { amount, notes } = result.data
        const isDeposit = amount > 0
        const absAmount = Math.abs(amount)

        // For deposit: check manager has enough balance
        if (isDeposit) {
            const currentManager = await prisma.user.findUnique({
                where: { id: manager.id },
                select: { balance: true }
            })

            if (!currentManager || currentManager.balance < absAmount) {
                return NextResponse.json(
                    { error: `رصيدك غير كافي. رصيدك الحالي: $${currentManager?.balance.toFixed(2) || 0}` },
                    { status: 400 }
                )
            }
        }

        // For withdraw: check user has enough balance
        if (!isDeposit) {
            if (targetUser.balance < absAmount) {
                return NextResponse.json(
                    { error: `رصيد المستخدم غير كافي. رصيده الحالي: $${targetUser.balance.toFixed(2)}` },
                    { status: 400 }
                )
            }
        }

        // Transactional update
        const updatedUser = await prisma.$transaction(async (tx) => {
            // 1. Update user balance
            const updated = await tx.user.update({
                where: { id },
                data: { balance: { increment: amount } }
            })

            // 2. Update manager balance (opposite direction)
            const updatedManager = await tx.user.update({
                where: { id: manager.id },
                data: { balance: { increment: -amount } }
            })

            // 3. Create transaction for user
            await tx.transaction.create({
                data: {
                    userId: id,
                    type: isDeposit ? 'DEPOSIT' : 'WITHDRAW',
                    amount: absAmount,
                    balanceAfter: updated.balance,
                    notes: notes || (isDeposit ? 'إيداع رصيد من المدير' : 'سحب رصيد من المدير'),
                    adminId: manager.id
                }
            })

            // 4. Create transaction for manager
            await tx.transaction.create({
                data: {
                    userId: manager.id,
                    type: isDeposit ? 'WITHDRAW' : 'DEPOSIT',
                    amount: absAmount,
                    balanceAfter: updatedManager.balance,
                    notes: isDeposit 
                        ? `تحويل رصيد للمستخدم: ${targetUser.username}`
                        : `استرداد رصيد من المستخدم: ${targetUser.username}`,
                }
            })

            // 5. Log activity
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

            // 6. Notify user
            await createNotification({
                userId: id,
                title: isDeposit ? 'تم إضافة رصيد' : 'تم سحب رصيد',
                message: isDeposit 
                    ? `تم إضافة $${absAmount.toFixed(2)} إلى رصيدك. الرصيد الحالي: $${updated.balance.toFixed(2)}`
                    : `تم سحب $${absAmount.toFixed(2)} من رصيدك. الرصيد الحالي: $${updated.balance.toFixed(2)}`,
                type: isDeposit ? 'success' : 'warning',
                link: '/dashboard/transactions'
            })

            return updated
        })

        return NextResponse.json({
            success: true,
            message: isDeposit 
                ? `تم إيداع $${absAmount.toFixed(2)} بنجاح`
                : `تم سحب $${absAmount.toFixed(2)} بنجاح`,
            newBalance: updatedUser.balance
        })

    } catch (error) {
        console.error('Manager balance update error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
