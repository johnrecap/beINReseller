import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
    createOperationDispatch,
    dispatchPendingOperationJobs,
    recordOperationDispatchEvidence,
} from '@/lib/operation-dispatch'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { Prisma } from '@prisma/client'
import { buildRenewalFinalConfirmationEvidence } from '@/lib/operation-final-confirmation'
import { processCompletedOperationPoints } from '@/lib/points/operation-awards'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

/**
 * POST /api/operations/[id]/confirm-purchase
 * 
 * Confirm final payment
 * - Verifies operation is in AWAITING_FINAL_CONFIRM state
 * - Deducts balance from user (deferred payment)
 * - Sends job to Worker to press OK button
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 1. Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Rate limit check
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `financial:${authUser.id}`,
            RATE_LIMITS.financial
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
            )
        }

        const { id } = await params

        // 2. Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                cardNumber: true,
                status: true,
                selectedPackage: true,
                finalConfirmExpiry: true,
                amount: true,
                responseData: true,
                heartbeatExpiry: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== authUser.id) {
            return NextResponse.json(
                { error: 'Unauthorized access to this operation' },
                { status: 403 }
            )
        }

        // Check status
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'Operation is not in final confirmation stage' },
                { status: 400 }
            )
        }

        // Get price from selectedPackage
        const selectedPkg = operation.selectedPackage as { price: number; name: string } | null
        const dealerPrice = selectedPkg?.price

        if (!dealerPrice || dealerPrice <= 0) {
            return NextResponse.json(
                { error: 'Invalid package price' },
                { status: 400 }
            )
        }

        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            return NextResponse.json(
                { error: 'Final confirmation timed out. Please start again.' },
                { status: 400 }
            )
        }

        // Deduct balance NOW - only if not already deducted (deployment safety)
        let finalAmount = dealerPrice
        if (operation.amount === 0) {
            // NEW flow: deferred payment — deduct at confirm time
            await prisma.$transaction(async (tx) => {
                // Race guard: ensure operation is still confirmable before charging.
                const operationGuard = await tx.operation.updateMany({
                    where: {
                        id,
                        userId: authUser.id,
                        status: 'AWAITING_FINAL_CONFIRM',
                        amount: 0,
                        OR: [
                            { finalConfirmExpiry: null },
                            { finalConfirmExpiry: { gt: new Date() } },
                        ],
                    },
                    data: {
                        status: 'COMPLETING',
                        amount: dealerPrice,
                        responseMessage: 'Confirming payment...',
                        responseData: buildRenewalFinalConfirmationEvidence(operation.responseData, 'CONFIRM_PURCHASE'),
                        finalConfirmExpiry: null,
                        heartbeatExpiry: null,
                    }
                })

                if (operationGuard.count === 0) {
                    throw new Error('OPERATION_NOT_CONFIRMABLE')
                }

                const user = await tx.user.findUnique({
                    where: { id: authUser.id },
                    select: { balance: true }
                })

                if (!user || user.balance < dealerPrice) {
                    throw new Error('INSUFFICIENT_BALANCE')
                }

                const updatedUser = await tx.user.update({
                    where: { id: authUser.id },
                    data: { balance: { decrement: dealerPrice } }
                })

                if (updatedUser.balance < 0) {
                    throw new Error('INSUFFICIENT_BALANCE')
                }

                // Create deduction transaction record
                await tx.transaction.create({
                    data: {
                        userId: authUser.id,
                        type: 'OPERATION_DEDUCT',
                        amount: -dealerPrice,
                        balanceAfter: updatedUser.balance,
                        operationId: id,
                        notes: `Renewal ${selectedPkg?.name || 'package'} for card ${operation.cardNumber}`,
                    }
                })

                await createOperationDispatch(tx, {
                    operationId: id,
                    type: 'CONFIRM_PURCHASE',
                    cardNumber: operation.cardNumber,
                    userId: authUser.id,
                    amount: dealerPrice,
                })
            })
        } else {
            // OLD flow: money was already deducted at select-package (deployment transition)
            console.log(`Operation ${id} already has amount ${operation.amount} - skipping deduction (legacy flow)`)
            finalAmount = operation.amount
            await prisma.$transaction(async (tx) => {
                const operationGuard = await tx.operation.updateMany({
                    where: {
                        id,
                        userId: authUser.id,
                        status: 'AWAITING_FINAL_CONFIRM',
                        OR: [
                            { finalConfirmExpiry: null },
                            { finalConfirmExpiry: { gt: new Date() } },
                        ],
                    },
                    data: {
                        status: 'COMPLETING',
                        amount: finalAmount,
                        responseMessage: 'Confirming payment...',
                        responseData: buildRenewalFinalConfirmationEvidence(operation.responseData, 'CONFIRM_PURCHASE'),
                        finalConfirmExpiry: null,
                        heartbeatExpiry: null,
                    },
                })

                if (operationGuard.count === 0) {
                    throw new Error('OPERATION_NOT_CONFIRMABLE')
                }

                await createOperationDispatch(tx, {
                    operationId: id,
                    type: 'CONFIRM_PURCHASE',
                    cardNumber: operation.cardNumber,
                    userId: authUser.id,
                    amount: finalAmount,
                })
            })
        }

        const dispatchResult = await dispatchPendingOperationJobs({
            operationIds: [id],
        })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch confirm-purchase job; saved for retry:', id)
            await recordOperationDispatchEvidence(id, {
                phase: 'DISPATCH_FAILED',
                message: 'Confirm purchase dispatch failed; saved for retry.',
            })
        }
        const completedOperation = await prisma.operation.findUnique({
            where: { id },
            select: { status: true },
        })
        if (completedOperation?.status === 'COMPLETED') {
            await processCompletedOperationPoints(id).catch((error) => {
                console.error('Confirm purchase point award error:', error)
            })
        }
        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            message: 'Confirming payment...',
            queued: dispatchResult.failed === 0,
        })

    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json(
                { error: 'Operation is already being processed' },
                { status: 409 }
            )
        }
        const msg = error instanceof Error ? error.message : ''
        if (msg === 'INSUFFICIENT_BALANCE') {
            return NextResponse.json(
                { error: 'Insufficient balance' },
                { status: 400 }
            )
        }
        if (msg === 'OPERATION_NOT_CONFIRMABLE') {
            return NextResponse.json(
                { error: 'Operation state changed. Please refresh and try again.' },
                { status: 409 }
            )
        }
        console.error('Confirm purchase error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
