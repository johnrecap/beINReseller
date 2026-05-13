import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

import { getOperationPriceFromDB } from '@/lib/pricing'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { createNotification } from '@/lib/notification'
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
const createOperationSchema = z.object({
    type: z.enum(['RENEW', 'CHECK_BALANCE', 'SIGNAL_REFRESH']),
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'Card number must contain only digits'),
    duration: z.string().optional(),
})

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
        const validationResult = createOperationSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { type, cardNumber, duration } = validationResult.data

        // 4. Calculate price from settings
        const price = await getOperationPriceFromDB(type, duration)
        if (price <= 0) {
            return NextResponse.json(
                { error: 'Invalid operation type' },
                { status: 400 }
            )
        }

        // 5. Get user (basic check)
        const userExists = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: { id: true },
        })

        if (!userExists) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // 6. Create operation in a transaction with balance check INSIDE
        const result = await prisma.$transaction(async (tx) => {
            // Check for duplicate pending/processing operations
            const existingOperation = await tx.operation.findFirst({
                where: {
                    cardNumber,
                    status: { in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING', 'AWAITING_FINAL_CONFIRM'] },
                },
            })

            if (existingOperation) {
                throw new Error('DUPLICATE_OPERATION')
            }

            // Deduct balance only if the committed balance is still sufficient.
            const debitResult = await tx.user.updateMany({
                where: {
                    id: authUser.id,
                    balance: { gte: price },
                },
                data: { balance: { decrement: price } },
            })

            if (debitResult.count !== 1) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            const updatedUser = await tx.user.findUniqueOrThrow({
                where: { id: authUser.id },
                select: { id: true, balance: true },
            })

            // Create operation
            const operation = await tx.operation.create({
                data: {
                    userId: updatedUser.id,
                    type: type as 'RENEW' | 'CHECK_BALANCE' | 'SIGNAL_REFRESH',
                    cardNumber,
                    amount: price,
                    status: 'PENDING',
                    duration: duration || null,
                },
            })

            // Create transaction record
            await tx.transaction.create({
                data: {
                    userId: updatedUser.id,
                    type: 'OPERATION_DEDUCT',
                    amount: -price,
                    balanceAfter: updatedUser.balance,
                    operationId: operation.id,
                    notes: `Operation deduction ${type === 'RENEW' ? 'renewal' : type === 'CHECK_BALANCE' ? 'balance check' : 'signal activation'}`,
                },
            })

            // Log activity
            await tx.activityLog.create({
                data: {
                    userId: updatedUser.id,
                    action: 'OPERATION_CREATED',
                    details: `Created ${type} operation for card ${cardNumber}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            return { operation, newBalance: updatedUser.balance }
        })

        // 7. Add job to queue
        try {
            await addOperationJob({
                operationId: result.operation.id,
                type,
                cardNumber,
                duration,
                userId: authUser.id,
                amount: price,
            })

            // Send notification
            await createNotification({
                userId: authUser.id,
                title: 'Request received',
                message: `Processing ${type === 'RENEW' ? 'renewal' : type === 'CHECK_BALANCE' ? 'balance check' : 'signal activation'} operation`,
                type: 'info',
                link: '/dashboard/history'
            })

        } catch (queueError) {
            console.error('Failed to add job to queue:', queueError)
            // Don't fail the request, the operation is saved in DB
        }

        // 8. Return success
        return NextResponse.json({
            success: true,
            operationId: result.operation.id,
            deducted: price,
            newBalance: result.newBalance,
        })

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Create operation error:', error)

        if (errorMessage === 'INSUFFICIENT_BALANCE') {
            return NextResponse.json(
                { error: 'Insufficient balance' },
                { status: 400 }
            )
        }

        if (errorMessage === 'DUPLICATE_OPERATION') {
            return NextResponse.json(
                { error: 'There is an active operation for this card' },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
