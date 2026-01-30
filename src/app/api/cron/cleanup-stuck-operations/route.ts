/**
 * Cleanup Stuck Operations - Heartbeat-based Auto-Cancel
 * 
 * This cron job runs every 10 seconds and:
 * 1. Finds operations where heartbeatExpiry < now (frontend stopped sending heartbeats)
 * 2. Finds operations in AWAITING_* states without any heartbeat for > 30 seconds
 * 3. For each stuck operation:
 *    - Marks status as EXPIRED
 *    - Refunds user (if amount > 0)
 *    - Releases beIN account lock
 *    - Creates notification
 *    - Cleans up Redis keys
 * 
 * This handles:
 * - Browser close
 * - Tab close
 * - Network disconnect
 * - User leaving page
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'

// Configuration
const LOCK_PREFIX = 'bein:account:lock:'
const HEARTBEAT_GRACE_PERIOD_SECONDS = 30  // Grace period for operations without heartbeat

// Statuses that require heartbeat monitoring
const HEARTBEAT_REQUIRED_STATUSES = [
    'AWAITING_PACKAGE',
    'AWAITING_FINAL_CONFIRM',
    'AWAITING_CAPTCHA'
] as const

export async function GET(request: Request) {
    try {
        // ===== MANDATORY: Verify cron secret for security =====
        const authHeader = request.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        // CRITICAL: Fail if secret is not configured
        if (!cronSecret) {
            console.error('[Cleanup Cron] CRON_SECRET is not configured - refusing to process')
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

        const now = new Date()
        const graceTime = new Date(now.getTime() - HEARTBEAT_GRACE_PERIOD_SECONDS * 1000)

        // Find operations that:
        // 1. Have expired heartbeat (heartbeatExpiry < now)
        // 2. OR are in AWAITING_* state without any heartbeat for > 30s
        const stuckOperations = await prisma.operation.findMany({
            where: {
                OR: [
                    // Case 1: Heartbeat explicitly expired
                    {
                        status: { in: [...HEARTBEAT_REQUIRED_STATUSES] },
                        heartbeatExpiry: { lt: now }
                    },
                    // Case 2: In waiting state but never received heartbeat (old operations)
                    {
                        status: { in: [...HEARTBEAT_REQUIRED_STATUSES] },
                        lastHeartbeat: null,
                        createdAt: { lt: graceTime }
                    }
                ]
            },
            include: {
                user: { select: { id: true, balance: true } }
            }
        })

        if (stuckOperations.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No stuck operations found',
                processed: 0,
                timestamp: now.toISOString()
            })
        }

        console.log(`[Cleanup Cron] Found ${stuckOperations.length} stuck operations with expired heartbeat`)

        let expiredCount = 0
        let refundedCount = 0
        let accountsReleased = 0
        const errors: string[] = []

        for (const operation of stuckOperations) {
            try {
                const shouldRefund = operation.amount > 0

                // Determine expiry reason
                let expiryReason = 'انتهت مهلة العملية - لم يتم استلام نبضة من المتصفح'
                if (operation.status === 'AWAITING_PACKAGE') {
                    expiryReason = 'انتهت مهلة اختيار الباقة - تم إغلاق المتصفح أو فقد الاتصال'
                } else if (operation.status === 'AWAITING_FINAL_CONFIRM') {
                    expiryReason = 'انتهت مهلة التأكيد النهائي - تم إغلاق المتصفح أو فقد الاتصال'
                } else if (operation.status === 'AWAITING_CAPTCHA') {
                    expiryReason = 'انتهت مهلة حل الكابتشا - تم إغلاق المتصفح أو فقد الاتصال'
                }

                await prisma.$transaction(async (tx) => {
                    // 1. Update operation status to EXPIRED
                    await tx.operation.update({
                        where: { id: operation.id },
                        data: {
                            status: 'EXPIRED',
                            error: expiryReason,
                            responseMessage: shouldRefund
                                ? `${expiryReason} - تم استرداد المبلغ تلقائياً`
                                : expiryReason,
                            completedAt: now
                        }
                    })

                    // 2. Refund user balance only if amount > 0 AND no existing refund AND has userId (not store customer)
                    if (shouldRefund && operation.userId) {
                        // Check for existing refund to prevent double refund
                        const existingRefund = await tx.transaction.findFirst({
                            where: {
                                operationId: operation.id,
                                type: 'REFUND'
                            }
                        })

                        if (existingRefund) {
                            console.log(`[Cleanup Cron] Refund already exists for ${operation.id}, skipping`)
                        } else {
                            const user = await tx.user.update({
                                where: { id: operation.userId },
                                data: { balance: { increment: operation.amount } }
                            })

                            // Create refund transaction
                            await tx.transaction.create({
                                data: {
                                    userId: operation.userId,
                                    type: 'REFUND',
                                    amount: operation.amount,
                                    balanceAfter: user.balance,
                                    operationId: operation.id,
                                    notes: `استرداد تلقائي - ${expiryReason}`
                                }
                            })

                            refundedCount++
                            console.log(`[Cleanup Cron] Refunded ${operation.amount} to user ${operation.userId}`)
                        }
                    }

                    // 3. Create notification for user (only if userId exists - not store customer)
                    if (operation.userId) {
                        await tx.notification.create({
                            data: {
                                userId: operation.userId,
                                title: 'انتهت مهلة العملية',
                                message: shouldRefund
                                    ? `تم إلغاء العملية تلقائياً واسترداد ${operation.amount} ريال. السبب: ${expiryReason}`
                                    : `تم إلغاء العملية تلقائياً. السبب: ${expiryReason}`,
                                type: 'warning',
                                link: `/dashboard/operations/${operation.id}`
                            }
                        })
                    }

                    // 4. Log activity (only if userId exists - not store customer)
                    if (operation.userId) {
                        await tx.activityLog.create({
                            data: {
                                userId: operation.userId,
                                action: 'OPERATION_EXPIRED_NO_HEARTBEAT',
                                details: {
                                    operationId: operation.id,
                                    previousStatus: operation.status,
                                    lastHeartbeat: operation.lastHeartbeat?.toISOString() || null,
                                    heartbeatExpiry: operation.heartbeatExpiry?.toISOString() || null,
                                    refunded: shouldRefund ? operation.amount : 0,
                                    reason: expiryReason
                                },
                                ipAddress: 'cleanup-cron'
                            }
                        })
                    }
                })

                // 5. Release beIN account lock in Redis (outside transaction)
                if (operation.beinAccountId) {
                    try {
                        const lockKey = `${LOCK_PREFIX}${operation.beinAccountId}`
                        await redis.del(lockKey)
                        accountsReleased++
                        console.log(`[Cleanup Cron] Released lock for beIN account ${operation.beinAccountId}`)
                    } catch (lockError) {
                        console.error(`[Cleanup Cron] Failed to release lock for account ${operation.beinAccountId}:`, lockError)
                    }
                }

                // 6. Clean up Redis heartbeat key
                try {
                    await redis.del(`operation:heartbeat:${operation.id}`)
                } catch (redisError) {
                    console.error(`[Cleanup Cron] Failed to clean Redis heartbeat key:`, redisError)
                }

                expiredCount++
                console.log(`[Cleanup Cron] Expired operation ${operation.id} (was ${operation.status})`)

            } catch (err) {
                console.error(`[Cleanup Cron] Failed to expire operation ${operation.id}:`, err)
                errors.push(operation.id)
            }
        }

        console.log(`[Cleanup Cron] Summary: expired=${expiredCount}, refunded=${refundedCount}, accountsReleased=${accountsReleased}, errors=${errors.length}`)

        return NextResponse.json({
            success: true,
            processed: stuckOperations.length,
            expired: expiredCount,
            refunded: refundedCount,
            accountsReleased,
            errors: errors.length > 0 ? errors : undefined,
            timestamp: now.toISOString()
        })

    } catch (error) {
        console.error('[Cleanup Cron] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * POST endpoint - Can be used by internal services or for manual trigger
 */
export async function POST(request: Request) {
    return GET(request)
}
