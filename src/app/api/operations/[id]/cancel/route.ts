import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { operationsQueue } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { getCustomerFromRequest } from '@/lib/customer-auth'
import { refundUser, refundCustomer } from '@/lib/refund'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

/**
 * Helper to get authenticated user from session, mobile token, OR customer token
 * Returns an object with either userId or customerId for ownership checks
 */
async function getAuthUser(request: NextRequest): Promise<{ userId?: string; customerId?: string } | null> {
    // Try web session first (reseller panel)
    const session = await auth()
    if (session?.user?.id) {
        return { userId: session.user.id }
    }

    // Try mobile token (reseller mobile app)
    const mobileUser = getMobileUserFromRequest(request)
    if (mobileUser?.id) {
        return { userId: mobileUser.id }
    }

    // Try customer token (customer mobile app)
    const customer = getCustomerFromRequest(request)
    if (customer?.customerId) {
        return { customerId: customer.customerId }
    }

    return null
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Check authentication (supports web session, mobile token, and customer token)
        const authUser = await getAuthUser(request)
        if (!authUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Rate limit check
        const rateLimitKey = authUser.userId || authUser.customerId || 'unknown'
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `financial:${rateLimitKey}`,
            RATE_LIMITS.financial
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
            )
        }

        const { id } = await params

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership (support both reseller userId and mobile app customerId)
        const isOwner =
            (authUser.userId && operation.userId === authUser.userId) ||
            (authUser.customerId && operation.customerId === authUser.customerId)
        if (!isOwner) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            )
        }

        // RADICAL FIX: Allow cancellation of ANY status except COMPLETED and CANCELLED
        const nonCancellableStatuses = ['COMPLETED', 'CANCELLED', 'REVIEW_REQUIRED']
        if (nonCancellableStatuses.includes(operation.status)) {
            return NextResponse.json(
                { error: 'Cannot cancel a completed or previously cancelled operation' },
                { status: 400 }
            )
        }

        // Check if a refund already exists from prior failure
        const existingRefund = await prisma.transaction.findFirst({
            where: {
                operationId: id,
                type: 'REFUND'
            }
        })

        // Also check customer wallet refund
        const existingCustomerRefund = operation.customerId ? await prisma.walletTransaction.findFirst({
            where: {
                referenceId: id,
                referenceType: 'REFUND'
            }
        }) : null

        const hasExistingRefund = existingRefund || existingCustomerRefund

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

        // If refund already exists (from prior failure), just mark as cancelled without double refund
        if (hasExistingRefund) {
            console.log(`ℹ️ Operation ${id} already has refund from prior failure - marking as cancelled only`)

            // Extract for TypeScript type narrowing
            const resellerUserId = authUser.userId

            await prisma.$transaction(async (tx) => {
                // Update operation status only, with state guard to avoid overwriting COMPLETED races.
                const cancelGuard = await tx.operation.updateMany({
                    where: {
                        id,
                        status: { notIn: ['COMPLETED', 'CANCELLED', 'REVIEW_REQUIRED'] },
                    },
                    data: {
                        status: 'CANCELLED',
                        responseMessage: 'Cancelled by user (amount already refunded)',
                    },
                })

                if (cancelGuard.count === 0) {
                    throw new Error('OPERATION_NOT_CANCELLABLE')
                }

                // Log activity (only for reseller users, not customer app)
                if (resellerUserId) {
                    await tx.activityLog.create({
                        data: {
                            userId: resellerUserId,
                            action: 'OPERATION_CANCELLED',
                            details: `Cancel ${operation.type} operation for card ${operation.cardNumber} (previous refund)`,
                            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                        },
                    })
                }
            })

            return NextResponse.json({
                success: true,
                message: 'Operation cancelled (amount already refunded)',
                refunded: 0,
                previouslyRefunded: true,
            })
        }

        // Normal case: Update status first, then refund atomically
        const resellerUserId = authUser.userId

        // Step 1: Mark as cancelled + log activity
        await prisma.$transaction(async (tx) => {
            const cancelGuard = await tx.operation.updateMany({
                where: {
                    id,
                    status: { notIn: ['COMPLETED', 'CANCELLED', 'REVIEW_REQUIRED'] },
                },
                data: {
                    status: 'CANCELLED',
                    responseMessage: 'Cancelled by user',
                },
            })

            if (cancelGuard.count === 0) {
                throw new Error('OPERATION_NOT_CANCELLABLE')
            }

            if (resellerUserId) {
                await tx.activityLog.create({
                    data: {
                        userId: resellerUserId,
                        action: 'OPERATION_CANCELLED',
                        details: `Cancel ${operation.type} operation for card ${operation.cardNumber}`,
                        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    },
                })
            }
        })

        // Step 2: Reload latest financial state before refunding.
        // This avoids stale amount=0 snapshots when confirm-purchase is charging concurrently.
        const latestOperation = await prisma.operation.findUnique({
            where: { id },
            select: {
                userId: true,
                customerId: true,
                amount: true,
            }
        })

        const latestDeductTx = await prisma.transaction.findFirst({
            where: {
                operationId: id,
                type: 'OPERATION_DEDUCT',
            },
            orderBy: { createdAt: 'desc' },
            select: { amount: true }
        })

        const amountFromOperation = latestOperation?.amount || 0
        const amountFromDeductTx = latestDeductTx ? Math.abs(latestDeductTx.amount) : 0
        const amountToRefund = amountFromOperation > 0 ? amountFromOperation : amountFromDeductTx

        let refundedAmount = 0

        if (latestOperation?.userId && amountToRefund > 0) {
            const refunded = await refundUser(id, latestOperation.userId, amountToRefund, 'User cancellation')
            if (refunded) refundedAmount = amountToRefund
        }

        // Customer refunds rely on operation.amount; no OPERATION_DEDUCT row exists for customer wallet flow.
        if (latestOperation?.customerId && amountFromOperation > 0) {
            const refunded = await refundCustomer(id, latestOperation.customerId, amountFromOperation, 'User cancellation')
            if (refunded) refundedAmount = amountFromOperation
        }

        return NextResponse.json({
            success: true,
            message: refundedAmount > 0 ? 'Operation cancelled and amount refunded' : 'Operation cancelled',
            refunded: refundedAmount,
        })

    } catch (error) {
        const msg = error instanceof Error ? error.message : ''
        if (msg === 'OPERATION_NOT_CANCELLABLE') {
            return NextResponse.json(
                { error: 'Operation state changed and can no longer be cancelled.' },
                { status: 409 }
            )
        }
        console.error('Cancel operation error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
