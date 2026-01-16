import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { operationsQueue } from '@/lib/queue'

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

        // RADICAL FIX: Allow cancellation of ANY status except COMPLETED and CANCELLED
        const nonCancellableStatuses = ['COMPLETED', 'CANCELLED']
        if (nonCancellableStatuses.includes(operation.status)) {
            return NextResponse.json(
                { error: 'لا يمكن إلغاء عملية مكتملة أو ملغاة مسبقاً' },
                { status: 400 }
            )
        }

        // Safety check: Prevent double refund by checking if a refund already exists
        const existingRefund = await prisma.transaction.findFirst({
            where: {
                operationId: id,
                type: 'REFUND'
            }
        })

        if (existingRefund) {
            return NextResponse.json(
                { error: 'تم استرداد المبلغ مسبقاً لهذه العملية' },
                { status: 400 }
            )
        }

        // ===== CRITICAL: Remove jobs from Redis Queue FIRST =====
        try {
            const jobStates: ('waiting' | 'active' | 'delayed' | 'paused')[] = ['waiting', 'active', 'delayed', 'paused']
            const allJobs = await operationsQueue.getJobs(jobStates)
            let removedCount = 0

            for (const job of allJobs) {
                if (job.data?.operationId === id) {
                    await job.remove()
                    removedCount++
                    console.log(`🗑️ Removed Redis job ${job.id} for operation ${id}`)
                }
            }

            if (removedCount > 0) {
                console.log(`✅ Removed ${removedCount} Redis jobs for operation ${id}`)
            }
        } catch (queueError) {
            console.error('⚠️ Error removing jobs from queue:', queueError)
            // Continue with cancellation even if queue removal fails
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
