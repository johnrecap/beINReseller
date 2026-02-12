/**
 * POST /api/mobile/subscriptions/check
 * 
 * Check card status and get available packages
 * - Validate card number format
 * - Create operation (RENEW with PENDING status)
 * - Queue job for card check
 * - Return operationId
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

        // Create operation record
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.customerId,
                type: 'RENEW',
                cardNumber: cleanedCard,
                amount: 0,  // Will be set after package selection
                status: 'PENDING'
            }
        })

        // Queue the card check job (START_RENEWAL triggers card check + package loading)
        await addCustomerOperationJob({
            operationId: operation.id,
            type: 'START_RENEWAL',
            cardNumber: cleanedCard,
            customerId: customer.customerId
        })

        return NextResponse.json({
            success: true,
            operationId: operation.id,
            message: 'Checking card'
        })

    } catch (error) {
        console.error('Check card error:', error)
        return NextResponse.json(
            { success: false, error: 'Error checking card' },
            { status: 500 }
        )
    }
})
