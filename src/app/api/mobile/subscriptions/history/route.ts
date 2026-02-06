/**
 * GET /api/mobile/subscriptions/history
 * 
 * Return customer's past operations
 * - Paginated
 * - Filter by type (optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'
import { OperationType } from '@prisma/client'

export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const { searchParams } = new URL(request.url)

        // Pagination params
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        // Filter params
        const typeParam = searchParams.get('type')?.toUpperCase()
        const type = typeParam && ['RENEW', 'CHECK_BALANCE', 'SIGNAL_REFRESH'].includes(typeParam)
            ? typeParam as OperationType
            : undefined

        // Build where clause
        const where: { customerId: string; type?: OperationType } = {
            customerId: customer.customerId
        }

        if (type) {
            where.type = type
        }

        // Get operations with pagination
        const [operations, total] = await Promise.all([
            prisma.operation.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    type: true,
                    cardNumber: true,
                    amount: true,
                    status: true,
                    responseMessage: true,
                    selectedPackage: true,
                    createdAt: true,
                    completedAt: true
                }
            }),
            prisma.operation.count({ where })
        ])

        const totalPages = Math.ceil(total / limit)

        // Mask card numbers for privacy
        const maskedOperations = operations.map(op => ({
            ...op,
            cardNumber: op.cardNumber.slice(0, 4) + '****' + op.cardNumber.slice(-2)
        }))

        return NextResponse.json({
            success: true,
            operations: maskedOperations,
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
        console.error('Get operations history error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب سجل العمليات' },
            { status: 500 }
        )
    }
})
