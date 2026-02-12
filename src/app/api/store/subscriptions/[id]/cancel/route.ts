/**
 * Store Subscription Cancel
 * POST /api/store/subscriptions/[id]/cancel
 * 
 * Cancels a pending subscription. Refunds store credit if used.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        
        // 2. Get subscription
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: { id: true }
                }
            }
        })
        
        if (!subscription) {
            return errorResponse('Subscription not found', 404, 'NOT_FOUND')
        }
        
        // 3. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('Unauthorized access to this subscription', 403, 'FORBIDDEN')
        }
        
        // 4. Check if cancellable
        const cancellableStatuses = ['PENDING', 'AWAITING_PACKAGE', 'AWAITING_PAYMENT']
        if (!cancellableStatuses.includes(subscription.status)) {
            return errorResponse(
                'Cannot cancel this subscription. Current status: ' + subscription.status,
                400,
                'CANNOT_CANCEL'
            )
        }
        
        // 5. Refund store credit if used
        const creditToRefund = subscription.creditUsed
        
        await prisma.$transaction([
            // Update subscription status
            prisma.storeSubscription.update({
                where: { id: subscription.id },
                data: { status: 'CANCELLED' }
            }),
            // Cancel operation if exists
            ...(subscription.operation ? [
                prisma.operation.update({
                    where: { id: subscription.operation.id },
                    data: { status: 'CANCELLED' }
                })
            ] : []),
            // Refund store credit if used
            ...(creditToRefund > 0 ? [
                prisma.customer.update({
                    where: { id: customer.id },
                    data: {
                        storeCredit: { increment: creditToRefund }
                    }
                })
            ] : [])
        ])
        
        return successResponse({
            subscriptionId: subscription.id,
            status: 'CANCELLED',
            creditRefunded: creditToRefund,
            message: creditToRefund > 0 
                ? `Subscription cancelled and ${creditToRefund} ${subscription.currency} refunded to your balance`
                : 'Subscription cancelled',
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
