/**
 * POST /api/mobile/subscriptions/renew
 * 
 * Renew subscription with selected package
 * - Validate wallet balance
 * - Deduct from wallet
 * - Create WalletTransaction
 * - Queue renewal job
 */

import { NextRequest, NextResponse } from 'next/server'
import { withCustomerAuth } from '@/lib/customer-auth'
import { legacyRenewalRouteDisabledPayload } from '@/lib/operations/renewal-creation-guard'

interface PackageSelection {
    packageId: string
    packageName: string
    price: number
    duration: string
}

export const POST = withCustomerAuth(async (request: NextRequest) => {
    try {
        const body = await request.json()
        const { operationId, selectedPackage } = body as {
            operationId: string
            selectedPackage: PackageSelection
        }

        if (!operationId || !selectedPackage) {
            return NextResponse.json(
                { success: false, error: 'Operation ID and package are required' },
                { status: 400 }
            )
        }

        if (!selectedPackage.price || selectedPackage.price <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid package price' },
                { status: 400 }
            )
        }

        // The Worker intentionally has no generic `RENEW` handler. This route
        // previously debited the wallet before dispatching that unsupported job.
        return NextResponse.json(
            { success: false, ...legacyRenewalRouteDisabledPayload() },
            { status: 409 }
        )

    } catch (error) {
        console.error('Renew subscription error:', error)
        return NextResponse.json(
            { success: false, error: 'Error renewing subscription' },
            { status: 500 }
        )
    }
})
