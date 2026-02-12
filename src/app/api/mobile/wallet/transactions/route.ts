/**
 * GET /api/mobile/wallet/transactions
 * 
 * Get paginated transaction history
 * - Filter by type (optional)
 * - Paginated with cursor or offset
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'
import { WalletTransactionType } from '@prisma/client'

export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const { searchParams } = new URL(request.url)

        // Pagination params
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        // Filter params
        const typeParam = searchParams.get('type')?.toUpperCase()
        const type = typeParam && ['CREDIT', 'DEBIT', 'REFUND'].includes(typeParam)
            ? typeParam as WalletTransactionType
            : undefined

        // Build where clause
        const where: { customerId: string; type?: WalletTransactionType } = {
            customerId: customer.customerId
        }

        if (type) {
            where.type = type
        }

        // Get transactions with pagination
        const [transactions, total] = await Promise.all([
            prisma.walletTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    type: true,
                    amount: true,
                    balanceBefore: true,
                    balanceAfter: true,
                    description: true,
                    referenceType: true,
                    createdAt: true
                }
            }),
            prisma.walletTransaction.count({ where })
        ])

        const totalPages = Math.ceil(total / limit)

        return NextResponse.json({
            success: true,
            transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        })

    } catch (error) {
        console.error('Get transactions error:', error)
        return NextResponse.json(
            { success: false, error: 'Error fetching operation history' },
            { status: 500 }
        )
    }
})
