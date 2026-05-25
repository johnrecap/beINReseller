import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { Prisma } from '@prisma/client'
import { parseOperationResponseData } from '@/lib/operation-safety'
import { processCompletedOperationPoints } from '@/lib/points/operation-awards'

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

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * POST /api/operations/[id]/confirm-installment
 * 
 * Confirm and execute installment payment
 * User has reviewed the installment details and confirms payment
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: operationId } = await params

        // Check authentication
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                userId: true,
                status: true,
                cardNumber: true,
                amount: true,
                responseData: true, // CRITICAL: Need this to get the actual price
                finalConfirmExpiry: true,
            }
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized access to this operation' },
                { status: 403 }
            )
        }

        // Verify status is awaiting confirmation
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'Operation is not in awaiting confirmation state' },
                { status: 400 }
            )
        }

        // Check if confirmation has expired
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            // Mark as failed
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'FAILED',
                    responseMessage: 'Confirmation timeout'
                }
            })

            return NextResponse.json(
                { error: 'Confirmation timeout' },
                { status: 400 }
            )
        }

        // Get dealer price from responseData
        const responseData = parseOperationResponseData(operation.responseData)
        const installmentData = responseData.installment as { dealerPrice?: unknown } | undefined
        const dealerPrice = typeof installmentData?.dealerPrice === 'number' ? installmentData.dealerPrice : 0

        if (dealerPrice <= 0) {
            return NextResponse.json(
                { error: 'Invalid installment price' },
                { status: 400 }
            )
        }

        // Charge the operation owner (admin may confirm on behalf of user)
        const chargedUserId = operation.userId || authUser.id
        if (!chargedUserId) {
            return NextResponse.json(
                { error: 'Operation has no chargeable user' },
                { status: 400 }
            )
        }

        // Atomic financial step: race guard + balance deduction + transaction row
        await prisma.$transaction(async (tx) => {
            const opGuard = await tx.operation.updateMany({
                where: {
                    id: operationId,
                    status: 'AWAITING_FINAL_CONFIRM',
                    amount: 0
                },
                data: {
                    status: 'COMPLETING',
                    amount: dealerPrice,
                    responseMessage: 'Confirming installment payment...'
                }
            })

            if (opGuard.count === 0) {
                throw new Error('OPERATION_NOT_CONFIRMABLE')
            }

            const user = await tx.user.findUnique({
                where: { id: chargedUserId },
                select: { balance: true }
            })

            if (!user || user.balance < dealerPrice) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            const updatedUser = await tx.user.update({
                where: { id: chargedUserId },
                data: { balance: { decrement: dealerPrice } }
            })

            if (updatedUser.balance < 0) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            await tx.transaction.create({
                data: {
                    userId: chargedUserId,
                    type: 'OPERATION_DEDUCT',
                    amount: -dealerPrice,
                    balanceAfter: updatedUser.balance,
                    operationId,
                    notes: `Installment payment for card ${operation.cardNumber}`
                }
            })
        })

        // Add job to queue for final payment
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'CONFIRM_INSTALLMENT',
                cardNumber: operation.cardNumber,
                userId: chargedUserId,
                amount: dealerPrice, // Pass the actual price
            })
        } catch (queueError) {
            console.error('Failed to add confirm job to queue:', queueError)

            // Refund on failure
            await prisma.$transaction(async (tx) => {
                const updatedUser = await tx.user.update({
                    where: { id: chargedUserId },
                    data: { balance: { increment: dealerPrice } }
                })

                await tx.operation.update({
                    where: { id: operationId },
                    data: {
                        status: 'FAILED',
                        amount: 0,
                        responseMessage: 'Failed to confirm payment - amount refunded'
                    }
                })

                await tx.transaction.create({
                    data: {
                        userId: chargedUserId,
                        type: 'REFUND',
                        amount: dealerPrice,
                        balanceAfter: updatedUser.balance,
                        operationId,
                        notes: 'Auto-refund: failed to queue installment confirmation'
                    }
                })
            })

            return NextResponse.json(
                { error: 'Failed to confirm payment, amount refunded' },
                { status: 500 }
            )
        }

        const completedOperation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { status: true },
        })
        if (completedOperation?.status === 'COMPLETED') {
            await processCompletedOperationPoints(operationId).catch((error) => {
                console.error('Confirm installment point award error:', error)
            })
        }

        return NextResponse.json({
            success: true,
            message: 'Completing payment...'
        })

    } catch (error) {
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
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json(
                { error: 'Operation is already being processed' },
                { status: 409 }
            )
        }
        console.error('Confirm installment error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
