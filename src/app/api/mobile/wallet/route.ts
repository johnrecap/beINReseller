/**
 * GET /api/mobile/wallet
 * 
 * Get customer wallet balance
 * - Return balance, storeCredit, currency
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        // Get fresh customer data from database
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.customerId },
            select: {
                walletBalance: true,
                storeCredit: true,
                country: true
            }
        })

        if (!customerData) {
            return NextResponse.json(
                { success: false, error: 'Account not found' },
                { status: 404 }
            )
        }

        // Determine currency based on country
        const currency = customerData.country === 'EG' ? 'EGP' : 'SAR'

        return NextResponse.json({
            success: true,
            wallet: {
                balance: customerData.walletBalance,
                storeCredit: customerData.storeCredit,
                totalAvailable: customerData.walletBalance + customerData.storeCredit,
                currency
            }
        })

    } catch (error) {
        console.error('Get wallet error:', error)
        return NextResponse.json(
            { success: false, error: 'Error fetching balance' },
            { status: 500 }
        )
    }
})
