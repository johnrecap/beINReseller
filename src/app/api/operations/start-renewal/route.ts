import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { roleHasPermission } from '@/lib/auth-utils'
import { PERMISSIONS } from '@/lib/permissions'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import redis from '@/lib/redis'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    // Try web session first
    const session = await auth()
    if (session?.user?.id) {
        return session.user
    }
    // Fall back to mobile token
    return getMobileUserFromRequest(request)
}

// Validation schema
const startRenewalSchema = z.object({
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'Card number must contain only digits'),
    smartcardType: z.enum(['CISCO', 'IRDETO']).default('CISCO').optional(),
})

const ACTIVE_OPERATION_STATUSES = ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING', 'AWAITING_FINAL_CONFIRM'] as const
const CARD_START_LOCK_TTL_SECONDS = 30

/**
 * POST /api/operations/start-renewal
 *
 * Start interactive renewal operation (Wizard)
 * - Creates Operation with PENDING status
 * - Sends job to Worker to start session and extract packages
 * - Returns operationId for tracking
 */
export async function POST(request: NextRequest) {
    try {
        // 1. Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // 2. Check permission - only users with SUBSCRIPTION_RENEW can access
        if (!roleHasPermission(authUser.role, PERMISSIONS.SUBSCRIPTION_RENEW)) {
            return NextResponse.json(
                { error: 'Insufficient permissions' },
                { status: 403 }
            )
        }

        // 2.5 Check maintenance mode - block non-admin users
        if (authUser.role !== 'ADMIN') {
            const maintenanceSetting = await prisma.setting.findUnique({
                where: { key: 'maintenance_mode' }
            })
            if (maintenanceSetting?.value === 'true') {
                const msgSetting = await prisma.setting.findUnique({
                    where: { key: 'maintenance_message' }
                })
                return NextResponse.json(
                    { error: msgSetting?.value || 'System under maintenance, please try again later' },
                    { status: 503 }
                )
            }
        }

        // 3. Check rate limit
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `operations:${authUser.id}`,
            RATE_LIMITS.operations
        )

        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
            )
        }

        // 4. Parse and validate input
        const body = await request.json()
        const validationResult = startRenewalSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid card number', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { cardNumber, smartcardType } = validationResult.data

        // 5. Card-level lock: prevents concurrent start requests for the same card
        const cardLockKey = `operation:start-renewal:card-lock:${cardNumber}`
        const lockResult = await redis.set(cardLockKey, authUser.id, 'EX', CARD_START_LOCK_TTL_SECONDS, 'NX')

        if (lockResult !== 'OK') {
            const activeOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: { in: [...ACTIVE_OPERATION_STATUSES] },
                },
                orderBy: { createdAt: 'desc' },
            })

            if (activeOperation) {
                return NextResponse.json(
                    { error: 'There is an active operation for this card', operationId: activeOperation.id },
                    { status: 409 }
                )
            }

            return NextResponse.json(
                { error: 'Another request for this card is already in progress. Please try again in a few seconds.' },
                { status: 409 }
            )
        }

        try {
            // Check 1: Active operations (in-progress statuses)
            const existingOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: { in: [...ACTIVE_OPERATION_STATUSES] },
                },
            })

            if (existingOperation) {
                return NextResponse.json(
                    { error: 'There is an active operation for this card', operationId: existingOperation.id },
                    { status: 400 }
                )
            }

            // Check 2: Recently created operations (prevents rapid re-creation after auto-cancel)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
            const recentOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: { in: ['CANCELLED'] },
                    createdAt: { gte: fiveMinutesAgo },
                },
                orderBy: { createdAt: 'desc' },
            })

            if (recentOperation) {
                return NextResponse.json(
                    { error: 'This card was recently used. Please wait a few minutes before trying again.', operationId: recentOperation.id },
                    { status: 400 }
                )
            }

            // Check 3: recently finished operations to prevent immediate double-charging loops.
            const recentFinishedOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: 'COMPLETED',
                    createdAt: { gte: fiveMinutesAgo },
                },
                orderBy: { createdAt: 'desc' },
            })

            if (recentFinishedOperation) {
                return NextResponse.json(
                    { error: 'This card was renewed recently. Please wait a few minutes before trying again.', operationId: recentFinishedOperation.id },
                    { status: 400 }
                )
            }

            // 6. Create operation (no balance deduction yet - will be done after package selection)
            const operation = await prisma.operation.create({
                data: {
                    userId: authUser.id,
                    type: 'RENEW',
                    cardNumber,
                    amount: 0, // Will be determined after package selection
                    status: 'PENDING',
                },
            })

            // 7. Log activity (fire-and-forget - do not block response)
            prisma.$transaction([
                prisma.activityLog.create({
                    data: {
                        userId: authUser.id,
                        action: 'RENEWAL_STARTED',
                        details: `Start renewal for card ${cardNumber}`,
                        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    },
                }),
                prisma.userAction.create({
                    data: {
                        userId: authUser.id,
                        actionType: 'RENEWAL_STARTED',
                        details: { cardNumber: cardNumber, operationId: operation.id },
                    }
                })
            ]).catch(e => console.error('Activity log failed:', e))

            // 8. Add job to queue (start-renewal type)
            try {
                await addOperationJob({
                    operationId: operation.id,
                    type: 'START_RENEWAL',
                    cardNumber,
                    userId: authUser.id,
                    smartcardType: smartcardType || 'CISCO',
                })
            } catch (queueError) {
                console.error('Failed to add job to queue:', queueError)
                // Update operation status to FAILED
                await prisma.operation.update({
                    where: { id: operation.id },
                    data: {
                        status: 'FAILED',
                        responseMessage: 'Failed to add operation to queue'
                    },
                })
                return NextResponse.json(
                    { error: 'Failed to start operation, please try again' },
                    { status: 500 }
                )
            }

            // 9. Return success with full operation object for Flutter
            return NextResponse.json({
                success: true,
                operationId: operation.id,
                message: 'Starting renewal operation...',
                operation: {
                    id: operation.id,
                    userId: operation.userId,
                    type: operation.type,
                    cardNumber: operation.cardNumber,
                    amount: operation.amount,
                    status: operation.status,
                    createdAt: operation.createdAt.toISOString(),
                },
            })
        } finally {
            await redis.del(cardLockKey).catch((lockError) => {
                console.error('Failed to release start-renewal card lock:', lockError)
            })
        }

    } catch (error) {
        console.error('Start renewal error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
