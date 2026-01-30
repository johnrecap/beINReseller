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
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
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
            return errorResponse('الاشتراك غير موجود', 404, 'NOT_FOUND')
        }
        
        // 3. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('غير مصرح بالوصول لهذا الاشتراك', 403, 'FORBIDDEN')
        }
        
        // 4. Check status
        if (subscription.operation?.status !== 'AWAITING_FINAL_CONFIRM') {
            return errorResponse('الاشتراك لا يتطلب تأكيد نهائي حالياً', 400, 'CONFIRM_NOT_REQUIRED')
        }
        
        // 5. Check if expired
        const operation = subscription.operation
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            return errorResponse('انتهت مهلة التأكيد - يرجى بدء عملية جديدة', 400, 'CONFIRM_EXPIRED')
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
            message: 'جاري تأكيد الدفع النهائي...',
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
