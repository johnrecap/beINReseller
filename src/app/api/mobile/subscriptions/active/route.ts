import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'
import { NextRequest } from 'next/server'
import { OperationStatus } from '@prisma/client'

/**
 * GET /api/mobile/subscriptions/active
 * Returns all active/pending operations for the authenticated customer
 */
export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        // Get all non-completed, non-cancelled operations for this customer
        const activeStatuses: OperationStatus[] = ['PENDING', 'PROCESSING', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING']

        const operations = await prisma.operation.findMany({
            where: {
                customerId: customer.customerId,
                status: { in: activeStatuses }
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                cardNumber: true,
                type: true,
                status: true,
                amount: true,
                createdAt: true,
                responseMessage: true,
            }
        })

        // Mask card numbers for security
        const maskedOperations = operations.map(op => ({
            ...op,
            cardNumber: `${op.cardNumber.slice(0, 4)}****${op.cardNumber.slice(-4)}`,
            createdAt: op.createdAt.toISOString(),
        }))

        return NextResponse.json({
            success: true,
            operations: maskedOperations,
            count: operations.length
        })

    } catch (error) {
        console.error('Error fetching active operations:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ أثناء جلب العمليات' },
            { status: 500 }
        )
    }
})
