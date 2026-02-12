import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob } from '@/lib/queue'
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
        const responseData = operation.responseData ? JSON.parse(operation.responseData as string) : null
        const dealerPrice = responseData?.installment?.dealerPrice || 0

        if (dealerPrice <= 0) {
            return NextResponse.json(
                { error: 'Invalid installment price' },
                { status: 400 }
            )
        }

        // Check user balance against dealerPrice
        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: { balance: true }
        })

        if (!user || user.balance < dealerPrice) {
            return NextResponse.json(
                { error: 'Insufficient balance' },
                { status: 400 }
            )
        }

        // Deduct balance
        await prisma.user.update({
            where: { id: authUser.id },
            data: {
                balance: { decrement: dealerPrice }
            }
        })

        // Update operation status + set amount NOW (after payment)
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETING',
                amount: dealerPrice // Set amount only AFTER deduction so refund is correct
            }
        })

        // Add job to queue for final payment
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'CONFIRM_INSTALLMENT',
                cardNumber: operation.cardNumber,
                userId: authUser.id,
                amount: dealerPrice, // Pass the actual price
            })
        } catch (queueError) {
            console.error('Failed to add confirm job to queue:', queueError)

            // Refund on failure
            await prisma.user.update({
                where: { id: authUser.id },
                data: {
                    balance: { increment: dealerPrice }
                }
            })

            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'FAILED',
                    responseMessage: 'Failed to confirm payment'
                }
            })

            return NextResponse.json(
                { error: 'Failed to confirm payment, amount refunded' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Completing payment...'
        })

    } catch (error) {
        console.error('Confirm installment error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
