import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// This endpoint should be called by a cron job every 5 minutes
// Example: Vercel Cron, or external service like cron-job.org

export async function GET(request: Request) {
    try {
        // Verify cron secret (optional - for security)
        const authHeader = request.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Find operations stuck in PROCESSING for more than 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

        const stuckOperations = await prisma.operation.findMany({
            where: {
                status: 'PROCESSING',
                updatedAt: { lt: fiveMinutesAgo },
            },
            include: {
                user: { select: { id: true, balance: true } },
            },
        })

        console.log(`Found ${stuckOperations.length} stuck operations`)

        let refundedCount = 0
        const errors: string[] = []

        for (const operation of stuckOperations) {
            try {
                await prisma.$transaction(async (tx) => {
                    // Update operation status to FAILED
                    await tx.operation.update({
                        where: { id: operation.id },
                        data: {
                            status: 'FAILED',
                            responseMessage: 'انتهت مهلة العملية - تم استرداد المبلغ تلقائياً',
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
                            notes: 'استرداد تلقائي - انتهت مهلة العملية',
                        },
                    })

                    // Log activity
                    await tx.activityLog.create({
                        data: {
                            userId: operation.userId,
                            action: 'OPERATION_TIMEOUT',
                            details: `انتهت مهلة العملية ${operation.id} - تم استرداد ${operation.amount} ريال`,
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
