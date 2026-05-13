import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { roleHasPermission } from '@/lib/auth-utils'
import { PERMISSIONS } from '@/lib/permissions'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) {
        return session.user
    }
    return getMobileUserFromRequest(request)
}

// Validation schema
const startInstallmentSchema = z.object({
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'Card number must contain only digits'),
})

/**
 * POST /api/operations/start-installment
 * 
 * Start installment payment flow
 * - Creates Operation with status PENDING
 * - Sends job to worker to load installment details
 * - Returns operationId for polling
 */
export async function POST(request: NextRequest) {
    try {
        // 1. Check authentication
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // 2. Check permission - using SUBSCRIPTION_RENEW for now (can add specific permission later)
        if (!roleHasPermission(authUser.role, PERMISSIONS.SUBSCRIPTION_RENEW)) {
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

        // 4. Parse and validate input
        const body = await request.json()
        const validationResult = startInstallmentSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid card number', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { cardNumber } = validationResult.data

        // 5. Check for duplicate pending operations for this card
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

        const operation = await prisma.$transaction(async (tx) => {
            const createdOperation = await tx.operation.create({
                data: {
                    userId: authUser.id,
                    type: 'RENEW', // Using RENEW type for installment operations
                    cardNumber,
                    amount: 0, // Will be set after loading installment details
                    status: 'PENDING',
                },
            })

            await tx.activityLog.create({
                data: {
                    userId: authUser.id,
                    action: 'INSTALLMENT_STARTED',
                    details: `Start installment payment for card ${cardNumber}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            await tx.userAction.create({
                data: {
                    userId: authUser.id,
                    actionType: 'INSTALLMENT_STARTED',
                    details: { cardNumber: cardNumber, operationId: createdOperation.id },
                }
            })

            await createOperationDispatch(tx, {
                operationId: createdOperation.id,
                type: 'START_INSTALLMENT',
                cardNumber,
                userId: authUser.id,
            })

            return createdOperation
        })

        const dispatchResult = await dispatchPendingOperationJobs({
            operationIds: [operation.id],
        })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch start-installment job; saved for retry:', operation.id)
        }

        // 9. Return success
        return NextResponse.json({
            success: true,
            operationId: operation.id,
            message: 'Loading installment data...',
            operation: {
                id: operation.id,
                userId: operation.userId,
                type: operation.type,
                cardNumber: operation.cardNumber,
                amount: operation.amount,
                status: operation.status,
                createdAt: operation.createdAt.toISOString(),
            },
            queued: dispatchResult.failed === 0,
        })

    } catch (error) {
        console.error('Start installment error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
