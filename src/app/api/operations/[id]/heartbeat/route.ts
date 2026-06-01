/**
 * Operation Heartbeat API
 * 
 * Frontend sends heartbeat every 2 seconds to keep operation alive.
 * If no heartbeat received for 5 seconds, operation will be auto-cancelled.
 * 
 * This handles:
 * - Browser close
 * - Tab close
 * - Network disconnect
 * - User leaving page
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { OperationStatus } from '@prisma/client'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { recoverOperationIfNeeded } from '@/lib/operations/recovery'
import { HEARTBEAT_REDIS_TTL_SECONDS, HEARTBEAT_STALE_SECONDS } from '@/lib/operations/timing'
import { planHeartbeatTimeoutAction } from '@/lib/operations/lock-timeouts'
import { releaseAccountLockSafely } from '@/lib/operations/account-lock-release'
import { mergeOperationPhaseEvidence } from '@/lib/operation-safety'

// Configuration
const HEARTBEAT_TTL_SECONDS = HEARTBEAT_STALE_SECONDS

// Statuses that require heartbeat
const HEARTBEAT_REQUIRED_STATUSES: OperationStatus[] = [
    'AWAITING_PACKAGE',
    'AWAITING_FINAL_CONFIRM',
    'AWAITING_CAPTCHA'
]

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await request.json().catch(() => ({})) as { unloading?: boolean }
        const authUser = await getAuthUser(request)

        if (!authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Verify operation belongs to user and is in awaiting state
        const operation = await prisma.operation.findFirst({
            where: {
                id,
                userId: authUser.id,
                status: { in: HEARTBEAT_REQUIRED_STATUSES }
            },
            select: {
                id: true,
                status: true,
                beinAccountId: true,
                finalConfirmExpiry: true,
                amount: true,
                responseData: true
            }
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found or not in waiting state' },
                { status: 404 }
            )
        }

        if (body.unloading === true) {
            const timeoutPlan = planHeartbeatTimeoutAction({
                operationStatus: operation.status,
                operationAmount: operation.amount ?? 0,
                operationResponseData: operation.responseData,
            })

            if (timeoutPlan.action === 'cancel_before_pay' && (operation.amount ?? 0) <= 0) {
                await prisma.operation.updateMany({
                    where: {
                        id,
                        userId: authUser.id,
                        status: { in: HEARTBEAT_REQUIRED_STATUSES },
                    },
                    data: {
                        status: 'EXPIRED',
                        responseMessage: 'Operation cancelled because the customer left before final Pay.',
                        finalConfirmExpiry: null,
                        heartbeatExpiry: null,
                        responseData: mergeOperationPhaseEvidence(operation.responseData, {
                            phase: 'RECOVERY_TIMEOUT',
                            finalPaySubmitted: false,
                        }),
                    },
                })
                await releaseAccountLockSafely(redis, operation.beinAccountId, operation.id)

                return NextResponse.json({
                    success: true,
                    expired: true,
                    status: 'EXPIRED',
                })
            }
        }

        // Check hard deadline (e.g., 2 min for package selection, 30s for payment confirm)
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            const recovery = await recoverOperationIfNeeded(id, 'heartbeat')
            if (recovery.skipped && recovery.reason === 'recovery_lock_held') {
                return NextResponse.json(
                    {
                        error: 'Operation recovery in progress',
                        expired: true,
                        recoveryPending: true,
                        status: operation.status,
                    },
                    { status: 409 }
                )
            }

            return NextResponse.json(
                {
                    error: 'Operation timed out',
                    expired: true,
                    reviewRequired: recovery.reviewRequired,
                    status: recovery.newStatus,
                    recovery,
                },
                { status: 410 }
            )
        }

        const now = new Date()
        const expiryTime = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000)

        // Update heartbeat in database
        const heartbeatUpdate = await prisma.operation.updateMany({
            where: {
                id,
                userId: authUser.id,
                status: { in: HEARTBEAT_REQUIRED_STATUSES },
            },
            data: {
                lastHeartbeat: now,
                heartbeatExpiry: expiryTime
            }
        })

        if (heartbeatUpdate.count === 0) {
            return NextResponse.json(
                { error: 'Operation not found or not in waiting state' },
                { status: 404 }
            )
        }

        // Also store in Redis for fast checking by cleanup job
        await redis.setex(
            `operation:heartbeat:${id}`,
            HEARTBEAT_REDIS_TTL_SECONDS,
            JSON.stringify({
                timestamp: now.toISOString(),
                status: operation.status,
                beinAccountId: operation.beinAccountId
            })
        )

        return NextResponse.json({
            success: true,
            expiresAt: expiryTime.toISOString(),
            deadlineAt: operation.finalConfirmExpiry?.toISOString() || null,
            ttlSeconds: HEARTBEAT_TTL_SECONDS,
            status: operation.status
        })

    } catch (error) {
        console.error('[Heartbeat] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * GET - Check heartbeat status (for debugging)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authUser = await getAuthUser(request)

        if (!authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const operation = await prisma.operation.findFirst({
            where: {
                id,
                userId: authUser.id
            },
            select: {
                id: true,
                status: true,
                lastHeartbeat: true,
                heartbeatExpiry: true
            }
        })

        if (!operation) {
            return NextResponse.json({ error: 'Operation not found' }, { status: 404 })
        }

        const now = new Date()
        const isExpired = operation.heartbeatExpiry
            ? now > operation.heartbeatExpiry
            : false

        return NextResponse.json({
            operationId: operation.id,
            status: operation.status,
            lastHeartbeat: operation.lastHeartbeat?.toISOString() || null,
            heartbeatExpiry: operation.heartbeatExpiry?.toISOString() || null,
            isExpired,
            requiresHeartbeat: HEARTBEAT_REQUIRED_STATUSES.includes(operation.status)
        })

    } catch (error) {
        console.error('[Heartbeat] GET Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
