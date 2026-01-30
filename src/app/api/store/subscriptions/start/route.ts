/**
 * Store Subscription Start
 * POST /api/store/subscriptions/start
 * 
 * Customer enters beIN card number to start a subscription renewal.
 * Creates a StoreSubscription + Operation, then fetches packages from beIN.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { addOperationJob } from '@/lib/queue'
import { getMarkupPercentage } from '@/lib/store-pricing'

// Validation schema
const startSchema = z.object({
    cardNumber: z.string()
        .min(10, 'رقم الكارت يجب أن يكون 10 أرقام على الأقل')
        .max(16, 'رقم الكارت يجب أن يكون 16 رقم كحد أقصى')
        .regex(/^\d+$/, 'رقم الكارت يجب أن يحتوي على أرقام فقط'),
})

export async function POST(request: NextRequest) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
        }
        
        // 2. Validate input
        const body = await request.json()
        const result = startSchema.safeParse(body)
        
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { cardNumber } = result.data
        
        // 3. Check for existing pending subscription for this card
        const existingSubscription = await prisma.storeSubscription.findFirst({
            where: {
                customerId: customer.id,
                cardNumber,
                status: { 
                    in: ['PENDING', 'AWAITING_PACKAGE', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING'] 
                },
            },
        })
        
        if (existingSubscription) {
            return errorResponse(
                'هناك عملية جارية لهذا الكارت',
                400,
                'SUBSCRIPTION_IN_PROGRESS'
            )
        }
        
        // 4. Get markup percentage from settings
        const markupPercent = await getMarkupPercentage()
        
        // 5. Get full customer data
        const fullCustomer = await prisma.customer.findUnique({
            where: { id: customer.id },
            select: { country: true, storeCredit: true }
        })
        
        const currency = fullCustomer?.country === 'EG' ? 'EGP' : 'SAR'
        
        // 6. Create Operation (using existing reseller system)
        const operation = await prisma.operation.create({
            data: {
                userId: customer.id, // Note: Store customer ID used here
                type: 'RENEW',
                cardNumber,
                amount: 0, // Will be set after package selection
                status: 'PENDING',
            },
        })
        
        // 7. Create StoreSubscription
        const subscription = await prisma.storeSubscription.create({
            data: {
                customerId: customer.id,
                cardNumber,
                status: 'PENDING',
                currency,
                price: 0, // Will be set after package selection
                markupPercent,
                operationId: operation.id,
            },
            select: {
                id: true,
                cardNumber: true,
                status: true,
                currency: true,
                createdAt: true,
            }
        })
        
        // 8. Add job to queue to fetch packages from beIN
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'START_RENEWAL',
                cardNumber,
                userId: customer.id,
            })
        } catch (queueError) {
            console.error('Failed to add job to queue:', queueError)
            
            // Update statuses to FAILED
            await prisma.$transaction([
                prisma.operation.update({
                    where: { id: operation.id },
                    data: { status: 'FAILED', responseMessage: 'فشل في إضافة العملية للطابور' }
                }),
                prisma.storeSubscription.update({
                    where: { id: subscription.id },
                    data: { status: 'FAILED', resultMessage: 'فشل في إضافة العملية للطابور' }
                })
            ])
            
            return errorResponse('فشل في بدء العملية، حاول مرة أخرى', 500, 'QUEUE_ERROR')
        }
        
        // 9. Return subscription info
        return successResponse({
            subscription: {
                id: subscription.id,
                cardNumber: `****${cardNumber.slice(-4)}`,
                status: subscription.status,
                currency: subscription.currency,
                storeCredit: fullCustomer?.storeCredit || 0,
                createdAt: subscription.createdAt.toISOString(),
            },
            message: 'جاري جلب الباقات المتاحة...',
        }, 'تم بدء العملية بنجاح', 201)
        
    } catch (error) {
        return handleApiError(error)
    }
}
