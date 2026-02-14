import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { roleHasPermission } from '@/lib/auth-utils'
import { PERMISSIONS } from '@/lib/permissions'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

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

        // 3. Parse and validate input
        const body = await request.json()
        const validationResult = startRenewalSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid card number', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { cardNumber, smartcardType } = validationResult.data

        // 4. Check for duplicate operations on the same card
        // Check 1: Active operations (in-progress statuses)
        const existingOperation = await prisma.operation.findFirst({
            where: {
                cardNumber,
                status: { in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING', 'AWAITING_FINAL_CONFIRM'] },
            },
        })

        if (existingOperation) {
            return NextResponse.json(
                { error: 'There is an active operation for this card', operationId: existingOperation.id },
                { status: 400 }
            )
        }

        // Check 2: Recently created operations (prevents rapid re-creation after auto-cancel)
        // The heartbeat cron cancels operations after 15s, so without this check
        // users could re-submit the same card immediately after navigating away
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        const recentOperation = await prisma.operation.findFirst({
            where: {
                cardNumber,
                status: { in: ['CANCELLED'] },
                createdAt: { gte: fiveMinutesAgo },
                // Only block if it was auto-cancelled (no response = user didn't complete it)
                responseMessage: null,
            },
            orderBy: { createdAt: 'desc' },
        })

        if (recentOperation) {
            return NextResponse.json(
                { error: 'This card was recently used. Please wait a few minutes before trying again.', operationId: recentOperation.id },
                { status: 400 }
            )
        }

        // 5. Create operation (no balance deduction yet - will be done after package selection)
        const operation = await prisma.operation.create({
            data: {
                userId: authUser.id,
                type: 'RENEW',
                cardNumber,
                amount: 0, // Will be determined after package selection
                status: 'PENDING',
            },
        })

        // 6. Log activity (fire-and-forget — don't block response)
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

        // 7. Add job to queue (start-renewal type)
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

        // 8. Return success with full operation object for Flutter
        return NextResponse.json({
            success: true,
            operationId: operation.id,
            message: 'Starting renewal operation...',
            // Include full operation for Flutter compatibility
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

    } catch (error) {
        console.error('Start renewal error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
