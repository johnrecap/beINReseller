/**
 * POST /api/mobile/subscriptions/signal
 * 
 * Create signal refresh operation
 * - Queue signal refresh job
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'
import { addCustomerOperationJob } from '@/lib/queue'

// Card number validation (10-12 digits)
function isValidCardNumber(cardNumber: string): boolean {
    const cleaned = cardNumber.replace(/\D/g, '')
    return cleaned.length >= 10 && cleaned.length <= 12
}

export const POST = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { cardNumber } = body

        // Validate card number
        if (!cardNumber) {
            return NextResponse.json(
                { success: false, error: 'Card number is required' },
                { status: 400 }
            )
        }

        const cleanedCard = cardNumber.replace(/\D/g, '')

        if (!isValidCardNumber(cleanedCard)) {
            return NextResponse.json(
                { success: false, error: 'Invalid card number (10-12 digits)' },
                { status: 400 }
            )
        }

        // Get signal refresh price from settings
        const setting = await prisma.setting.findUnique({
            where: { key: 'signal_refresh_price' }
        })
        const signalPrice = parseFloat(setting?.value || '0')

        // Check wallet balance if price > 0
        if (signalPrice > 0) {
            const customerData = await prisma.customer.findUnique({
                where: { id: customer.customerId },
                select: { walletBalance: true, storeCredit: true }
            })

            if (!customerData) {
                return NextResponse.json(
                    { success: false, error: 'Account not found' },
                    { status: 404 }
                )
            }

            const totalAvailable = customerData.walletBalance + customerData.storeCredit

            if (totalAvailable < signalPrice) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Insufficient balance',
                        code: 'INSUFFICIENT_BALANCE',
                        required: signalPrice,
                        available: totalAvailable
                    },
                    { status: 400 }
                )
            }

            // Deduct balance
            let creditDeduction = Math.min(customerData.storeCredit, signalPrice)
            let walletDeduction = signalPrice - creditDeduction

            await prisma.$transaction(async (tx) => {
                const balanceBefore = customerData.walletBalance

                await tx.customer.update({
                    where: { id: customer.customerId },
                    data: {
                        storeCredit: { decrement: creditDeduction },
                        walletBalance: { decrement: walletDeduction }
                    }
                })

                await tx.walletTransaction.create({
                    data: {
                        customerId: customer.customerId,
                        type: 'DEBIT',
                        amount: signalPrice,
                        balanceBefore,
                        balanceAfter: balanceBefore - walletDeduction,
                        description: 'Signal refresh',
                        referenceType: 'SIGNAL'
                    }
                })
            })
        }

        // Create operation record
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.customerId,
                type: 'SIGNAL_REFRESH',
                cardNumber: cleanedCard,
                amount: signalPrice,
                status: 'PENDING'
            }
        })

        // Queue the signal refresh job
        await addCustomerOperationJob({
            operationId: operation.id,
            type: 'SIGNAL_REFRESH',
            cardNumber: cleanedCard,
            customerId: customer.customerId,
            amount: signalPrice
        })

        return NextResponse.json({
            success: true,
            operationId: operation.id,
            message: 'Refreshing signal',
            deducted: signalPrice
        })

    } catch (error) {
        console.error('Signal refresh error:', error)
        return NextResponse.json(
            { success: false, error: 'Error refreshing signal' },
            { status: 500 }
        )
    }
})
