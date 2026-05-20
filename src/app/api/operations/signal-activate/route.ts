import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { roleHasPermission } from '@/lib/auth-utils'
import { PERMISSIONS } from '@/lib/permissions'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { parseOperationResponseData } from '@/lib/operation-safety'

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
const signalActivateSchema = z.object({
    operationId: z.string().min(1, 'Operation ID is required'),
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'Card number must contain only digits'),
})

/**
 * POST /api/operations/signal-activate
 * 
 * Step 2: Activate signal for a card (assumes check was done)
 * - Validates the operation exists and is ready for activation
 * - Sends SIGNAL_ACTIVATE job to Worker
 * - Returns operationId for polling
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

        // 2. Check permission - only users with SIGNAL_ACTIVATE can access
        if (!roleHasPermission(authUser.role, PERMISSIONS.SIGNAL_ACTIVATE)) {
            return NextResponse.json(
                { error: 'Insufficient permissions' },
                { status: 403 }
            )
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
        const validationResult = signalActivateSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { operationId, cardNumber } = validationResult.data

        // 4. Get the existing operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                userId: true,
                cardNumber: true,
                status: true,
                responseData: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (operation.userId !== authUser.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            )
        }

        // Check if operation is ready for activation
        const responseData = parseOperationResponseData(operation.responseData)

        if (!responseData?.awaitingActivate) {
            return NextResponse.json(
                { error: 'Operation not ready for activation' },
                { status: 400 }
            )
        }

        await prisma.$transaction(async (tx) => {
            await tx.operation.update({
                where: { id: operationId },
                data: { status: 'PENDING' },
            })

            await tx.activityLog.create({
                data: {
                    userId: authUser.id,
                    action: 'SIGNAL_ACTIVATE_STARTED',
                    details: `Signal activation for card ${cardNumber}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            await createOperationDispatch(tx, {
                operationId,
                type: 'SIGNAL_ACTIVATE',
                cardNumber,
                userId: authUser.id,
            })
        })

        const dispatchResult = await dispatchPendingOperationJobs({
            operationIds: [operationId],
        })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch signal activate job; saved for retry:', operationId)
        }

        // 8. Return success
        return NextResponse.json({
            success: true,
            operationId,
            message: 'Activating signal...',
            queued: dispatchResult.failed === 0,
        })

    } catch (error) {
        console.error('Signal activate error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
