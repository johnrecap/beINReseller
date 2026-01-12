import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const addBalanceSchema = z.object({
    amount: z.number().min(1, 'المبلغ يجب أن يكون أكبر من 0'),
    notes: z.string().optional(),
})

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const body = await request.json()
        const result = addBalanceSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: result.error.flatten() },
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
                    notes: notes || 'شحن رصيد بواسطة الإدارة',
                    adminId: session.user.id
                }
            })

            // 4. Log Activity
            await tx.activityLog.create({
                data: {
                    userId: session.user.id,
                    action: 'ADMIN_ADD_BALANCE',
                    details: `Added ${amount} to user ${currentUser.username}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })

            return updatedUser
        })

        return NextResponse.json({
            success: true,
            message: 'تم إضافة الرصيد بنجاح',
            newBalance: user.balance
        })

    } catch (error) {
        console.error('Add balance error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
