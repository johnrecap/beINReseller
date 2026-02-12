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
const signalRefreshSchema = z.object({
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'Card number must contain only digits'),
})

/**
 * POST /api/operations/signal-refresh
 * 
 * Start signal refresh operation
 * - Creates Operation with type SIGNAL_REFRESH
 * - Sends job to Worker to refresh signal
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
        const validationResult = signalRefreshSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid card number', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { cardNumber } = validationResult.data

        // 4. Check for duplicate pending/processing signal refresh operations for this card
        const existingOperation = await prisma.operation.findFirst({
            where: {
                cardNumber,
                type: 'SIGNAL_REFRESH',
                status: { in: ['PENDING', 'PROCESSING'] },
            },
        })

        if (existingOperation) {
            return NextResponse.json(
                { error: 'There is an active signal refresh operation for this card', operationId: existingOperation.id },
                { status: 400 }
            )
        }

        // 5. Create operation (Signal refresh is free - no balance deduction)
        const operation = await prisma.operation.create({
            data: {
                userId: authUser.id,
                type: 'SIGNAL_REFRESH',
                cardNumber,
                amount: 0, // Signal refresh is free
                status: 'PENDING',
            },
        })

        // 6. Log activity
        await prisma.activityLog.create({
            data: {
                userId: authUser.id,
                action: 'SIGNAL_REFRESH_STARTED',
                details: `Start signal refresh for card ${cardNumber}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        // 7. Add job to queue
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'SIGNAL_REFRESH',
                cardNumber,
                userId: authUser.id,
            })
        } catch (queueError) {
            console.error('Failed to add signal refresh job to queue:', queueError)
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

        // 8. Return success
        return NextResponse.json({
            success: true,
            operationId: operation.id,
            message: 'Refreshing signal...',
        })

    } catch (error) {
        console.error('Signal refresh error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
