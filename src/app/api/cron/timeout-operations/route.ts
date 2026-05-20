import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { refundUser } from '@/lib/refund'
import { decideRefundSafety, getOperationPhaseEvidence } from '@/lib/operation-safety'

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
        const COMPLETING_TIMEOUT = 2        // 2 minutes for COMPLETING (purchase takes <30s normally)
        // AWAITING_FINAL_CONFIRM uses finalConfirmExpiry field (2 minutes set by worker)

        const now = Date.now()
        const nowDate = new Date()

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
                    // AWAITING_FINAL_CONFIRM: expired based on finalConfirmExpiry field
                    {
                        status: 'AWAITING_FINAL_CONFIRM',
                        finalConfirmExpiry: { lt: nowDate },
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
                let timeoutMessage = 'Operation timeout'
                if (operation.status === 'AWAITING_PACKAGE') {
                    timeoutMessage = `Package selection timeout (${AWAITING_PACKAGE_TIMEOUT} minutes)`
                } else if (operation.status === 'COMPLETING') {
                    timeoutMessage = 'Purchase completion timeout'
                } else if (operation.status === 'PROCESSING') {
                    timeoutMessage = 'Operation processing timeout expired'
                } else if (operation.status === 'AWAITING_FINAL_CONFIRM') {
                    timeoutMessage = 'Final confirmation timeout (2 minutes)'
                }

                const refundDecision = decideRefundSafety({
                    operationId: operation.id,
                    operationStatus: operation.status,
                    operationAmount: operation.amount,
                    operationResponseData: operation.responseData,
                    phaseEvidence: getOperationPhaseEvidence(operation.responseData),
                    customerDeductTransactionExists: operation.amount > 0,
                    refundTransactionExists: false,
                })
                const requiresReview = operation.amount > 0 && refundDecision.reviewRequired
                const shouldRefund = operation.amount > 0 && refundDecision.refundAllowed

                const result = await prisma.$transaction(async (tx) => {
                    // Guard: only fail if operation is still in the same stale state.
                    const staleWhere = operation.status === 'AWAITING_FINAL_CONFIRM'
                        ? {
                            id: operation.id,
                            status: operation.status,
                            finalConfirmExpiry: { lt: nowDate },
                        }
                        : {
                            id: operation.id,
                            status: operation.status,
                            updatedAt: operation.updatedAt,
                        }

                    const timeoutGuard = await tx.operation.updateMany({
                        where: staleWhere,
                        data: {
                            status: requiresReview ? 'REVIEW_REQUIRED' : 'FAILED',
                            responseMessage: requiresReview
                                ? `${timeoutMessage} - manual review required before any refund (${refundDecision.reason})`
                                : shouldRefund
                                ? `${timeoutMessage} - amount auto-refunded`
                                : timeoutMessage,
                            finalConfirmExpiry: null,
                        },
                    })

                    if (timeoutGuard.count === 0) {
                        return { processed: false }
                    }

                    // Log activity (only if userId exists - not store customer)
                    if (operation.userId) {
                        await tx.activityLog.create({
                            data: {
                                userId: operation.userId,
                                action: 'OPERATION_TIMEOUT',
                                details: requiresReview
                                    ? `${timeoutMessage} - moved to review without refund (${refundDecision.reason})`
                                    : shouldRefund
                                        ? `${timeoutMessage} - ${operation.amount} SAR refunded`
                                        : timeoutMessage,
                                ipAddress: 'cron-job',
                            },
                        })
                    }

                    return { processed: true }
                })

                if (!result.processed) {
                    console.log(`Skip ${operation.id} - state changed while processing timeout`)
                    continue
                }

                if (shouldRefund && operation.userId && await refundUser(operation.id, operation.userId, operation.amount, timeoutMessage)) {
                    refundedCount++
                }
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
