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
import { CURRENCY_CONFIG, getStripeSecretKey, toStripeAmount } from '@/lib/store-pricing'
import { dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'
import {
    finalizeStoreSubscriptionPayment,
    markStoreSubscriptionPaymentReviewRequired,
} from '@/lib/store-subscription-payment-finalization'
import {
    matchesPersistedStorePaymentSelection,
    STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
} from '@/lib/store-subscription-payment-claim'

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
                },
                payment: {
                    select: {
                        id: true,
                        customerId: true,
                        stripePaymentIntentId: true,
                        amount: true,
                        currency: true,
                        status: true,
                    },
                },
            }
        })
        
        if (!subscription) {
            return errorResponse('Subscription not found', 404, 'NOT_FOUND')
        }
        
        // 4. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('Unauthorized access to this subscription', 403, 'FORBIDDEN')
        }
        
        if (
            !subscription.operation ||
            subscription.stripePaymentIntentId !== paymentIntentId
        ) {
            return errorResponse('Payment does not match this subscription', 400, 'PAYMENT_MISMATCH')
        }
        if (
            !subscription.payment ||
            subscription.payment.customerId !== customer.id ||
            subscription.payment.stripePaymentIntentId !== paymentIntentId
        ) {
            await prisma.$transaction((tx) => markStoreSubscriptionPaymentReviewRequired(tx, {
                subscriptionId: subscription.id,
                operationId: subscription.operation!.id,
                cardNumber: subscription.operation!.cardNumber,
                reasonCode: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
            }))
            return errorResponse(
                STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                409,
                STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE
            )
        }

        // A signed webhook or a concurrent request may have already finalized
        // the exact persisted payment. Do not create or dispatch a second one.
        if (subscription.status !== 'AWAITING_PAYMENT') {
            if (
                ['PAID', 'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING', 'COMPLETED'].includes(subscription.status) &&
                subscription.payment.status === 'SUCCEEDED'
            ) {
                const dispatchResult = await dispatchPendingOperationJobs({
                    operationIds: [subscription.operation.id],
                })
                return successResponse({
                    subscriptionId: subscription.id,
                    status: 'PAID',
                    message: 'Payment confirmed successfully. Processing operation...',
                    queued: dispatchResult.failed === 0,
                    reused: true,
                })
            }
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
        
        const country = subscription.currency === CURRENCY_CONFIG.EG.code ? 'EG' : 'SA'
        const expectedLocalAmount = subscription.price - subscription.creditUsed
        const expectedAmount = toStripeAmount(expectedLocalAmount, country)
        const expectedCurrency = CURRENCY_CONFIG[country].stripeCode
        const rawSelectedPackage = (
            subscription.operation.selectedPackage &&
            typeof subscription.operation.selectedPackage === 'object' &&
            !Array.isArray(subscription.operation.selectedPackage)
        )
            ? subscription.operation.selectedPackage as Record<string, unknown>
            : null
        const selectedPackage = (
            typeof rawSelectedPackage?.index === 'number' &&
            typeof rawSelectedPackage.name === 'string' &&
            typeof rawSelectedPackage.price === 'number'
        )
            ? {
                index: rawSelectedPackage.index,
                name: rawSelectedPackage.name,
                price: rawSelectedPackage.price,
            }
            : null
        const selectionConsistent = (
            !!selectedPackage &&
            matchesPersistedStorePaymentSelection({
                persisted: {
                    status: subscription.status,
                    packageName: subscription.packageName,
                    packagePrice: subscription.packagePrice,
                    price: subscription.price,
                    creditUsed: subscription.creditUsed,
                    stripePaymentIntentId: subscription.stripePaymentIntentId,
                    paymentId: subscription.paymentId,
                    paymentStatus: subscription.payment.status,
                    updatedAt: subscription.updatedAt,
                    selectedPackage: rawSelectedPackage,
                },
                selectedPackage,
                customerPrice: subscription.price,
            })
        )

        // 7. Verify the provider object against the immutable local claim.
        if (
            !selectionConsistent ||
            subscription.currency !== CURRENCY_CONFIG[country].code ||
            !Number.isFinite(expectedLocalAmount) ||
            expectedLocalAmount <= 0 ||
            toStripeAmount(subscription.payment.amount, country) !== expectedAmount ||
            paymentIntent.id !== subscription.stripePaymentIntentId ||
            paymentIntent.metadata.source !== 'store_renewal' ||
            paymentIntent.metadata.subscriptionId !== subscription.id ||
            paymentIntent.metadata.operationId !== subscription.operation.id ||
            paymentIntent.metadata.customerId !== customer.id ||
            paymentIntent.metadata.packageIndex !== selectedPackage?.index.toString() ||
            paymentIntent.metadata.packageName !== selectedPackage?.name ||
            paymentIntent.metadata.beinPrice !== selectedPackage?.price.toString() ||
            paymentIntent.metadata.customerPrice !== subscription.price.toString() ||
            paymentIntent.metadata.creditUsed !== subscription.creditUsed.toString() ||
            paymentIntent.amount !== expectedAmount ||
            paymentIntent.currency !== expectedCurrency ||
            subscription.payment.currency !== CURRENCY_CONFIG[country].code
        ) {
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
        
        // 9-11. Persist payment truth, advance the operation, and create the
        // retryable outbox row in one card-serialized transaction.
        await prisma.$transaction((tx) => finalizeStoreSubscriptionPayment(tx, {
            subscriptionId: subscription.id,
            operationId: subscription.operation!.id,
            cardNumber: subscription.operation!.cardNumber,
            customerId: customer.id,
            paymentIntentId: paymentIntent.id,
        }))

        const dispatchResult = await dispatchPendingOperationJobs({
            operationIds: [subscription.operation!.id],
        })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch store complete-purchase; saved for retry:', subscription.operation!.id)
        }
        
        return successResponse({
            subscriptionId: subscription.id,
            status: 'PAID',
            message: 'Payment confirmed successfully. Processing operation...',
            queued: dispatchResult.failed === 0,
        })
        
    } catch (error) {
        if (isRenewalCreationBlockedError(error)) {
            const payload = renewalCreationBlockedPayload(error)
            return errorResponse(payload.error, 409, payload.code)
        }
        return handleApiError(error)
    }
}
