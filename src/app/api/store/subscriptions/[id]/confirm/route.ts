/**
 * Store Subscription Final Confirm
 * POST /api/store/subscriptions/[id]/confirm
 * 
 * Final confirmation step if required by beIN (OK button).
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { addOperationJob } from '@/lib/queue'

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
        
        // 2. Get subscription with operation
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: {
                        id: true,
                        cardNumber: true,
                        status: true,
                        finalConfirmExpiry: true,
                    }
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
        
        // 4. Check status
        if (subscription.operation?.status !== 'AWAITING_FINAL_CONFIRM') {
            return errorResponse('Subscription does not require final confirmation', 400, 'CONFIRM_NOT_REQUIRED')
        }
        
        // 5. Check if expired
        const operation = subscription.operation
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            return errorResponse('Confirmation expired - please start a new operation', 400, 'CONFIRM_EXPIRED')
        }
        
        // 6. Add CONFIRM_PURCHASE job to queue
        await addOperationJob({
            operationId: operation.id,
            type: 'CONFIRM_PURCHASE',
            cardNumber: operation.cardNumber,
            userId: customer.id,
        })
        
        // 7. Update subscription status
        await prisma.storeSubscription.update({
            where: { id: subscription.id },
            data: { status: 'COMPLETING' }
        })
        
        return successResponse({
            subscriptionId: subscription.id,
            status: 'COMPLETING',
            message: 'Confirming final payment...',
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
