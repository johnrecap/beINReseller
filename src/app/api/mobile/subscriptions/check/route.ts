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
import { withCustomerAuth } from '@/lib/customer-auth'
import { legacyRenewalRouteDisabledPayload } from '@/lib/operations/renewal-creation-guard'

// Card number validation (10-12 digits)
function isValidCardNumber(cardNumber: string): boolean {
    const cleaned = cardNumber.replace(/\D/g, '')
    return cleaned.length >= 10 && cleaned.length <= 12
}

export const POST = withCustomerAuth(async (request: NextRequest) => {
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

        // This legacy mobile flow completes through an unsupported `RENEW`
        // Worker job. Do not create a stranded lifecycle reservation here.
        return NextResponse.json(
            { success: false, ...legacyRenewalRouteDisabledPayload() },
            { status: 409 }
        )

    } catch (error) {
        console.error('Check card error:', error)
        return NextResponse.json(
            { success: false, error: 'Error checking card' },
            { status: 500 }
        )
    }
})
