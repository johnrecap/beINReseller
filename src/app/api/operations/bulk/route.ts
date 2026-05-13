import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getOperationPriceFromDB } from '@/lib/pricing'
import { addOperationJob } from '@/lib/queue'
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

const MAX_CARDS_PER_REQUEST = 10

// Validation schema
const bulkOperationSchema = z.object({
    type: z.enum(['RENEW', 'CHECK_BALANCE', 'SIGNAL_REFRESH']),
    cardNumbers: z.array(z.string().min(10).max(16).regex(/^\d+$/))
        .min(1)
        .max(MAX_CARDS_PER_REQUEST),
    duration: z.string().optional(),
})

function isActiveCardConflict(error: unknown): boolean {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
}

export async function POST(request: NextRequest) {
    try {
        // Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Check permission - only users with SUBSCRIPTION_BULK can access
        if (!roleHasPermission(authUser.role, PERMISSIONS.SUBSCRIPTION_BULK)) {
            return NextResponse.json(
                { error: 'Insufficient permissions' },
                { status: 403 }
            )
        }

        // Parse and validate input
        const body = await request.json()
        const validationResult = bulkOperationSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { type, cardNumbers, duration } = validationResult.data

        // Remove duplicates
        const uniqueCardNumbers = [...new Set(cardNumbers)]

        // Calculate total price
        const pricePerOperation = await getOperationPriceFromDB(type, duration)
        if (pricePerOperation <= 0) {
            return NextResponse.json(
                { error: 'Invalid operation type' },
                { status: 400 }
            )
        }

        // Get user
        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: { id: true },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Check for existing pending/processing operations
        const existingOperations = await prisma.operation.findMany({
            where: {
                cardNumber: { in: uniqueCardNumbers },
                status: { in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING', 'AWAITING_FINAL_CONFIRM'] },
            },
            select: { cardNumber: true },
        })

        const blockedCards = existingOperations.map(op => op.cardNumber)
        const availableCards = uniqueCardNumbers.filter(card => !blockedCards.includes(card))

        if (availableCards.length === 0) {
            return NextResponse.json({
                error: 'All cards have active operations',
                blockedCards,
            }, { status: 400 })
        }

        // Create operations in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const freshExistingOperations = await tx.operation.findMany({
                where: {
                    cardNumber: { in: availableCards },
                    status: { in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING', 'AWAITING_FINAL_CONFIRM'] },
                },
                select: { cardNumber: true },
            })

            const freshBlockedCards = freshExistingOperations.map(op => op.cardNumber)
            const finalCards = availableCards.filter(card => !freshBlockedCards.includes(card))

            if (finalCards.length === 0) {
                throw new Error('ALL_CARDS_BLOCKED')
            }

            const finalTotalPrice = pricePerOperation * finalCards.length

            const debitResult = await tx.user.updateMany({
                where: {
                    id: user.id,
                    balance: { gte: finalTotalPrice },
                },
                data: { balance: { decrement: finalTotalPrice } },
            })

            if (debitResult.count !== 1) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            const updatedUser = await tx.user.findUniqueOrThrow({
                where: { id: user.id },
                select: { balance: true },
            })

            const startingBalance = updatedUser.balance + finalTotalPrice
            const operations = []

            for (const cardNumber of finalCards) {
                // Create operation
                const operation = await tx.operation.create({
                    data: {
                        userId: user.id,
                        type: type as 'RENEW' | 'CHECK_BALANCE' | 'SIGNAL_REFRESH',
                        cardNumber,
                        amount: pricePerOperation,
                        status: 'PENDING',
                        duration: duration || null,
                    },
                })

                operations.push({
                    cardNumber,
                    operationId: operation.id,
                })

                // Create transaction record
                await tx.transaction.create({
                    data: {
                        userId: user.id,
                        type: 'OPERATION_DEDUCT',
                        amount: -pricePerOperation,
                        balanceAfter: startingBalance - (operations.length * pricePerOperation),
                        operationId: operation.id,
                        notes: `Bulk operation deduction - ${cardNumber}`,
                    },
                })
            }

            // Log activity
            await tx.activityLog.create({
                data: {
                    userId: user.id,
                    action: 'BULK_OPERATION_CREATED',
                    details: `Created ${operations.length} bulk operations of type ${type}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            return {
                operations,
                newBalance: updatedUser.balance,
                blockedCards: [...blockedCards, ...freshBlockedCards],
                totalDeducted: finalTotalPrice,
            }
        })

        // Add jobs to queue (async)
        for (const op of result.operations) {
            try {
                await addOperationJob({
                    operationId: op.operationId,
                    type,
                    cardNumber: op.cardNumber,
                    duration,
                    userId: user.id,
                    amount: pricePerOperation,
                })
            } catch (err) {
                console.error(`Failed to queue operation ${op.operationId}:`, err)
            }
        }

        // Notify Success
        await createNotification({
            userId: user.id,
            title: 'Bulk request received',
            message: `Processing ${result.operations.length} operations`,
            type: 'info',
            link: '/dashboard/history'
        })

        return NextResponse.json({
            success: true,
            operations: result.operations,
            totalDeducted: result.totalDeducted,
            newBalance: result.newBalance,
            blockedCards: result.blockedCards.length > 0 ? result.blockedCards : undefined,
        })

    } catch (error) {
        if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
            return NextResponse.json(
                { error: 'Insufficient balance' },
                { status: 400 }
            )
        }

        if (error instanceof Error && error.message === 'ALL_CARDS_BLOCKED') {
            return NextResponse.json(
                { error: 'All cards have active operations' },
                { status: 400 }
            )
        }

        if (isActiveCardConflict(error)) {
            return NextResponse.json(
                { error: 'One or more cards have active operations' },
                { status: 400 }
            )
        }

        console.error('Bulk operation error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
