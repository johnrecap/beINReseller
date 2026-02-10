/**
 * Store Subscription History
 * GET /api/store/subscriptions/history
 * 
 * Returns customer's subscription history.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'

export async function GET(request: NextRequest) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)

        if (!customer) {
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
        }

        // 2. Parse query params
        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
        const status = searchParams.get('status') // Optional filter

        // 3. Build where clause
        const where: Record<string, unknown> = {
            customerId: customer.id,
        }

        if (status) {
            where.status = status
        }

        // 4. Get total count
        const total = await prisma.storeSubscription.count({ where })

        // 5. Get subscriptions
        const subscriptions = await prisma.storeSubscription.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                cardNumber: true,
                status: true,
                packageName: true,
                currency: true,
                price: true,
                creditUsed: true,
                resultMessage: true,
                completedAt: true,
                failedAt: true,
                createdAt: true,
            }
        })

        // 6. Transform response
        const result = subscriptions.map(sub => ({
            id: sub.id,
            cardNumber: sub.cardNumber,
            status: sub.status,
            packageName: sub.packageName,
            currency: sub.currency,
            price: sub.price,
            creditUsed: sub.creditUsed,
            resultMessage: sub.resultMessage,
            completedAt: sub.completedAt?.toISOString(),
            failedAt: sub.failedAt?.toISOString(),
            createdAt: sub.createdAt.toISOString(),
        }))

        return successResponse({
            subscriptions: result,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        })

    } catch (error) {
        return handleApiError(error)
    }
}
