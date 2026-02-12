/**
 * Store Subscription Confirm Payment
 * POST /api/store/subscriptions/[id]/confirm-payment
 * 
 * Called after Stripe payment succeeds in the Flutter app.
 * Confirms payment and continues the operation.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { getStripeSecretKey } from '@/lib/store-pricing'

interface RouteParams {
    params: Promise<{ id: string }>
}

// Validation schema
const confirmPaymentSchema = z.object({
    paymentIntentId: z.string().min(1, 'Payment intent ID is required'),
})

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        const body = await request.json()
        
        // 2. Validate input
        const result = confirmPaymentSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { paymentIntentId } = result.data
        
        // 3. Get subscription
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: {
                        id: true,
                        cardNumber: true,
                        status: true,
                        selectedPackage: true,
                    }
                }
            }
        })
        
        if (!subscription) {
            return errorResponse('Subscription not found', 404, 'NOT_FOUND')
        }
        
        // 4. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('Unauthorized access to this subscription', 403, 'FORBIDDEN')
        }
        
        // 5. Check status
        if (subscription.status !== 'AWAITING_PAYMENT') {
            return errorResponse('Subscription is not awaiting payment', 400, 'INVALID_STATUS')
        }
        
        // 6. Verify payment with Stripe
        const stripeSecretKey = await getStripeSecretKey()
        if (!stripeSecretKey) {
            return errorResponse('Payment system not configured', 500, 'STRIPE_NOT_CONFIGURED')
        }
        
        const stripe = new Stripe(stripeSecretKey)
        
        let paymentIntent: Stripe.PaymentIntent
        try {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
        } catch {
            return errorResponse('Invalid payment intent ID', 400, 'INVALID_PAYMENT_INTENT')
        }
        
        // 7. Verify payment belongs to this subscription
        if (paymentIntent.metadata.subscriptionId !== subscription.id) {
            return errorResponse('Payment does not match this subscription', 400, 'PAYMENT_MISMATCH')
        }
        
        // 8. Check payment status
        if (paymentIntent.status !== 'succeeded') {
            return errorResponse(
                `Payment status: ${paymentIntent.status}. Please try again.`,
                400,
                'PAYMENT_NOT_SUCCEEDED'
            )
        }
        
        // 9. Create Payment record
        const payment = await prisma.payment.create({
            data: {
                customerId: customer.id,
                stripePaymentIntentId: paymentIntent.id,
                amount: subscription.price - subscription.creditUsed,
                currency: subscription.currency,
                status: 'SUCCEEDED',
                type: 'SUBSCRIPTION',
                metadata: {
                    subscriptionId: subscription.id,
                    packageName: subscription.packageName,
                    creditUsed: subscription.creditUsed,
                },
            }
        })
        
        // 10. Update subscription and operation
        await prisma.$transaction([
            prisma.storeSubscription.update({
                where: { id: subscription.id },
                data: {
                    status: 'PAID',
                    paymentId: payment.id,
                }
            }),
            prisma.operation.update({
                where: { id: subscription.operation!.id },
                data: {
                    status: 'COMPLETING',
                }
            })
        ])
        
        // 11. Continue operation - add job to queue
        try {
            const { addOperationJob } = await import('@/lib/queue')
            await addOperationJob({
                operationId: subscription.operation!.id,
                type: 'COMPLETE_PURCHASE',
                cardNumber: subscription.operation!.cardNumber,
                userId: customer.id,
                amount: subscription.packagePrice || 0,
            })
        } catch (queueError) {
            console.error('Failed to add complete job to queue:', queueError)
            // Don't fail - the operation is in COMPLETING state and can be retried
        }
        
        return successResponse({
            subscriptionId: subscription.id,
            status: 'PAID',
            message: 'Payment confirmed successfully. Processing operation...',
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
