import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// This endpoint should be called by a cron job every 5 minutes
// Example: Vercel Cron, or external service like cron-job.org

export async function GET(request: Request) {
    try {
        // ===== MANDATORY: Verify cron secret for security =====
        const authHeader = request.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        // CRITICAL: Fail if secret is not configured
        if (!cronSecret) {
            console.error('CRON_SECRET is not configured - refusing to process')
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            )
        }

        // CRITICAL: Always require valid authorization
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Timeout settings (in minutes)
        const PROCESSING_TIMEOUT = 5        // 5 minutes for PROCESSING
        const AWAITING_PACKAGE_TIMEOUT = 15 // 15 minutes for AWAITING_PACKAGE (user must choose)
        const COMPLETING_TIMEOUT = 5        // 5 minutes for COMPLETING

        const now = Date.now()

        // Find operations stuck in various statuses
        const stuckOperations = await prisma.operation.findMany({
            where: {
                OR: [
                    // PROCESSING: stuck for more than 5 minutes
                    {
                        status: 'PROCESSING',
                        updatedAt: { lt: new Date(now - PROCESSING_TIMEOUT * 60 * 1000) },
                    },
                    // AWAITING_PACKAGE: user didn't choose for 15 minutes
                    {
                        status: 'AWAITING_PACKAGE',
                        updatedAt: { lt: new Date(now - AWAITING_PACKAGE_TIMEOUT * 60 * 1000) },
                    },
                    // COMPLETING: stuck for more than 5 minutes
                    {
                        status: 'COMPLETING',
                        updatedAt: { lt: new Date(now - COMPLETING_TIMEOUT * 60 * 1000) },
                    },
                ],
            },
            include: {
                user: { select: { id: true, balance: true } },
            },
        })

        console.log(`Found ${stuckOperations.length} stuck/expired operations`)

        let refundedCount = 0
        const errors: string[] = []

        for (const operation of stuckOperations) {
            try {
                // Determine timeout reason based on status
                let timeoutMessage = 'انتهت مهلة العملية'
                if (operation.status === 'AWAITING_PACKAGE') {
                    timeoutMessage = `انتهت مهلة اختيار الباقة (${AWAITING_PACKAGE_TIMEOUT} دقيقة)`
                } else if (operation.status === 'COMPLETING') {
                    timeoutMessage = 'انتهت مهلة إتمام الشراء'
                } else if (operation.status === 'PROCESSING') {
                    timeoutMessage = 'انتهت مهلة معالجة العملية'
                }

                // Only refund if amount > 0 (AWAITING_PACKAGE has amount=0)
                const shouldRefund = operation.amount > 0

                await prisma.$transaction(async (tx) => {
                    // Update operation status to FAILED
                    await tx.operation.update({
                        where: { id: operation.id },
                        data: {
                            status: 'FAILED',
                            responseMessage: shouldRefund
                                ? `${timeoutMessage} - تم استرداد المبلغ تلقائياً`
                                : timeoutMessage,
                        },
                    })

                    // Refund user balance only if amount > 0 AND no existing refund
                    if (shouldRefund) {
                        // ===== CRITICAL: Check for existing refund to prevent double refund =====
                        const existingRefund = await tx.transaction.findFirst({
                            where: {
                                operationId: operation.id,
                                type: 'REFUND'
                            }
                        })

                        if (existingRefund) {
                            console.log(`⚠️ Refund already exists for ${operation.id}, skipping`)
                        } else {
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
                                    notes: `استرداد تلقائي - ${timeoutMessage}`,
                                },
                            })
                        }
                    }

                    // Log activity
                    await tx.activityLog.create({
                        data: {
                            userId: operation.userId,
                            action: 'OPERATION_TIMEOUT',
                            details: shouldRefund
                                ? `${timeoutMessage} - تم استرداد ${operation.amount} ريال`
                                : timeoutMessage,
                            ipAddress: 'cron-job',
                        },
                    })
                })

                refundedCount++
            } catch (err) {
                console.error(`Failed to refund operation ${operation.id}:`, err)
                errors.push(operation.id)
            }
        }

        return NextResponse.json({
            success: true,
            processed: stuckOperations.length,
            refunded: refundedCount,
            errors: errors.length > 0 ? errors : undefined,
            timestamp: new Date().toISOString(),
        })

    } catch (error) {
        console.error('Timeout operations cron error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
