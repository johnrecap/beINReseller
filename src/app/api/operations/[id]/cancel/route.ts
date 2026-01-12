import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Check authentication
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'العملية غير موجودة' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== session.user.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 403 }
            )
        }

        // PENDING and AWAITING_CAPTCHA can be cancelled
        if (!['PENDING', 'AWAITING_CAPTCHA'].includes(operation.status)) {
            return NextResponse.json(
                { error: 'لا يمكن إلغاء هذه العملية - فقط العمليات قيد الانتظار يمكن إلغاؤها' },
                { status: 400 }
            )
        }

        // Cancel operation and refund in transaction
        await prisma.$transaction(async (tx) => {
            // Update operation status
            await tx.operation.update({
                where: { id },
                data: {
                    status: 'CANCELLED',
                    responseMessage: 'تم الإلغاء بواسطة المستخدم',
                },
            })

            // Refund user balance
            const user = await tx.user.update({
                where: { id: operation.userId },
                data: { balance: { increment: operation.amount } },
            })

            // Create refund transaction
            await tx.transaction.create({
                data: {
                    userId: operation.userId,
                    type: 'REFUND',
                    amount: operation.amount,
                    balanceAfter: user.balance,
                    operationId: operation.id,
                    notes: 'استرداد مبلغ عملية ملغاة',
                },
            })

            // Log activity
            await tx.activityLog.create({
                data: {
                    userId: session.user!.id,
                    action: 'OPERATION_CANCELLED',
                    details: `إلغاء عملية ${operation.type} للكارت ${operation.cardNumber.slice(-4)}****`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })
        })

        return NextResponse.json({
            success: true,
            message: 'تم إلغاء العملية واسترداد المبلغ',
            refunded: operation.amount,
        })

    } catch (error) {
        console.error('Cancel operation error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
