/**
 * Stripe Webhook Handler
 * 
 * POST - Handle Stripe webhook events for payment confirmations
 * 
 * This is a backup for payment confirmation in case the client-side
 * confirmation fails. The webhook ensures payments are always recorded.
 * 
 * Events handled:
 * - payment_intent.succeeded: Payment completed successfully
 * - payment_intent.payment_failed: Payment failed
 * - charge.refunded: Refund processed
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { CURRENCY_CONFIG, getStripeSecretKey, toStripeAmount } from '@/lib/store-pricing'
import Stripe from 'stripe'
import { dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import { finalizeMobileRenewalPayment } from '@/lib/mobile-renewal-payment-finalization'
import {
    finalizeStoreSubscriptionPayment,
    markStoreSubscriptionPaymentReviewRequired,
} from '@/lib/store-subscription-payment-finalization'
import { STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE } from '@/lib/store-subscription-payment-claim'
import { finalizeRenewalPaymentRefund } from '@/lib/renewal-payment-refund-finalization'

/**
 * Get webhook secret from settings
 */
async function getWebhookSecret(): Promise<string | null> {
    const setting = await prisma.storeSetting.findUnique({
        where: { key: 'stripe_webhook_secret' }
    })
    return setting?.value || process.env.STRIPE_WEBHOOK_SECRET || null
}

/**
 * POST /api/store/webhooks/stripe
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
    try {
        // Get raw body for signature verification
        const body = await request.text()
        const signature = request.headers.get('stripe-signature')

        if (!signature) {
            console.error('Stripe webhook: Missing signature')
            return NextResponse.json(
                { error: 'Missing signature' },
                { status: 400 }
            )
        }

        // Get Stripe keys
        const stripeSecretKey = await getStripeSecretKey()
        const webhookSecret = await getWebhookSecret()

        if (!stripeSecretKey || !webhookSecret) {
            console.error('Stripe webhook: Missing configuration')
            return NextResponse.json(
                { error: 'Webhook not configured' },
                { status: 500 }
            )
        }

        // Initialize Stripe
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })

        // Verify webhook signature
        let event: Stripe.Event
        try {
            event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
        } catch (err) {
            console.error('Stripe webhook signature verification failed:', err)
            return NextResponse.json(
                { error: 'Invalid signature' },
                { status: 400 }
            )
        }

        console.log(`Stripe webhook received: ${event.type}`)

        // Handle different event types
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
                break

            case 'payment_intent.payment_failed':
                await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
                break

            case 'charge.refunded':
                await handleRefund(event.data.object as Stripe.Charge, stripe)
                break

            default:
                console.log(`Unhandled event type: ${event.type}`)
        }

        return NextResponse.json({ received: true })

    } catch (error) {
        console.error('Stripe webhook error:', error)
        return NextResponse.json(
            { error: 'Webhook handler failed' },
            { status: 500 }
        )
    }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const paymentIntentId = paymentIntent.id
    const metadata = paymentIntent.metadata

    console.log(`Payment succeeded: ${paymentIntentId}`, metadata)

    // Find payment record
    const payment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        include: {
            order: true,
            subscription: true,
        }
    })

    if (!payment) {
        console.log(`Payment record not found for: ${paymentIntentId}`)
        return
    }

    // =========================================================
    // Handle MOBILE RENEWAL payments (from customer app)
    // =========================================================
    const localPaymentMetadata = payment.metadata &&
        typeof payment.metadata === 'object' &&
        !Array.isArray(payment.metadata)
        ? payment.metadata
        : null
    if (metadata.source === 'mobile_renewal' || localPaymentMetadata?.source === 'mobile_renewal') {
        const finalization = await prisma.$transaction((tx) =>
            finalizeMobileRenewalPayment(tx, {
                provider: {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    amountReceived: paymentIntent.amount_received,
                    currency: paymentIntent.currency,
                    metadata: paymentIntent.metadata,
                },
            })
        )

        if (finalization.shouldDispatch) {
            const dispatchResult = await dispatchPendingOperationJobs({
                operationIds: [finalization.operationId],
            })
            console.log(`[Webhook] CONFIRM_PURCHASE dispatch for ${finalization.operationId}: ${dispatchResult.failed === 0 ? 'queued' : 'saved for retry'}`)
        } else {
            console.log(`[Webhook] Mobile renewal payment replay ignored safely: ${paymentIntentId}`)
        }
        return
    }

    // Skip if already processed
    if (
        payment.status === 'SUCCEEDED' &&
        !(payment.type === 'SUBSCRIPTION' && payment.subscription?.status === 'AWAITING_PAYMENT')
    ) {
        console.log(`Payment already processed: ${paymentIntentId}`)
        return
    }

    // Handle based on payment type (existing logic for store orders/subscriptions)
    if (payment.type === 'ORDER' && payment.order) {
        await prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'SUCCEEDED' }
        })
        // Update order status to PAID
        if (payment.order.status === 'PENDING') {
            await prisma.order.update({
                where: { id: payment.order.id },
                data: {
                    status: 'PAID',
                    paidAt: new Date(),
                }
            })
            console.log(`Order ${payment.order.orderNumber} marked as PAID`)
        }
    } else if (payment.type === 'SUBSCRIPTION' && payment.subscription) {
        // Update subscription status
        if (payment.subscription.status === 'AWAITING_PAYMENT') {
            const operation = payment.subscription.operationId
                ? await prisma.operation.findUnique({
                    where: { id: payment.subscription.operationId },
                    select: { id: true, cardNumber: true, selectedPackage: true },
                })
                : null

            if (!operation) {
                throw new Error('STORE_RENEWAL_OPERATION_NOT_FOUND')
            }

            const country = payment.subscription.currency === CURRENCY_CONFIG.EG.code ? 'EG' : 'SA'
            const expectedCurrency = CURRENCY_CONFIG[country]
            const expectedProviderAmount = (
                payment.subscription.price - payment.subscription.creditUsed
            )
            const selectedPackage = (
                operation.selectedPackage &&
                typeof operation.selectedPackage === 'object' &&
                !Array.isArray(operation.selectedPackage)
            )
                ? operation.selectedPackage as Record<string, unknown>
                : null
            if (
                typeof selectedPackage?.index !== 'number' ||
                typeof selectedPackage.name !== 'string' ||
                typeof selectedPackage.price !== 'number' ||
                paymentIntent.status !== 'succeeded' ||
                payment.subscription.currency !== expectedCurrency.code ||
                payment.currency !== expectedCurrency.code ||
                !Number.isFinite(expectedProviderAmount) ||
                expectedProviderAmount <= 0 ||
                paymentIntent.metadata.source !== 'store_renewal' ||
                paymentIntent.metadata.subscriptionId !== payment.subscription.id ||
                paymentIntent.metadata.operationId !== operation.id ||
                paymentIntent.metadata.customerId !== payment.customerId ||
                paymentIntent.metadata.packageIndex !== selectedPackage.index.toString() ||
                paymentIntent.metadata.packageName !== selectedPackage.name ||
                paymentIntent.metadata.beinPrice !== selectedPackage.price.toString() ||
                paymentIntent.metadata.customerPrice !== payment.subscription.price.toString() ||
                paymentIntent.metadata.creditUsed !== payment.subscription.creditUsed.toString() ||
                toStripeAmount(payment.amount, country) !==
                    toStripeAmount(expectedProviderAmount, country) ||
                paymentIntent.amount !== toStripeAmount(expectedProviderAmount, country) ||
                paymentIntent.currency !== expectedCurrency.stripeCode
            ) {
                await prisma.$transaction((tx) => markStoreSubscriptionPaymentReviewRequired(tx, {
                    subscriptionId: payment.subscription!.id,
                    operationId: operation.id,
                    cardNumber: operation.cardNumber,
                    reasonCode: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                }))
                console.error(`Store subscription payment requires review: ${paymentIntentId}`)
                return
            }

            await prisma.$transaction((tx) => finalizeStoreSubscriptionPayment(tx, {
                subscriptionId: payment.subscription!.id,
                operationId: operation.id,
                cardNumber: operation.cardNumber,
                customerId: payment.customerId,
                paymentIntentId,
            }))
            await dispatchPendingOperationJobs({ operationIds: [operation.id] })
            console.log(`Subscription ${payment.subscription.id} payment confirmed`)
        }
    }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const paymentIntentId = paymentIntent.id
    const errorMessage = paymentIntent.last_payment_error?.message || 'Payment failed'

    console.log(`Payment failed: ${paymentIntentId} - ${errorMessage}`)

    // Find payment record
    const payment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        include: {
            order: true,
            subscription: true,
        }
    })

    if (!payment) {
        console.log(`Payment record not found for: ${paymentIntentId}`)
        return
    }

    // A delayed failure event must never downgrade succeeded/refunded truth.
    const update = await prisma.payment.updateMany({
        where: {
            id: payment.id,
            status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
            status: 'FAILED',
            failureMessage: errorMessage,
        }
    })

    if (update.count === 0) {
        console.log(`Ignored stale payment failure for: ${paymentIntentId}`)
        return
    }

    // For subscriptions, we don't automatically fail - customer can retry
    // For orders, we keep status as PENDING - customer can retry payment
    console.log(`Payment ${paymentIntentId} marked as FAILED`)
}

/**
 * Handle refund
 */
async function handleRefund(charge: Stripe.Charge, stripe: Stripe) {
    // Get payment intent ID from charge
    const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id

    if (!paymentIntentId) {
        console.log('Refund: No payment intent found')
        return
    }

    console.log(`Refund processed for: ${paymentIntentId}`)

    // Find payment record
    const payment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        include: {
            order: true,
            subscription: true,
        }
    })

    if (!payment) {
        console.log(`Payment record not found for: ${paymentIntentId}`)
        return
    }

    const providerPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    const localMetadata = payment.metadata &&
        typeof payment.metadata === 'object' &&
        !Array.isArray(payment.metadata)
        ? payment.metadata as Record<string, unknown>
        : null
    const providerSource = providerPaymentIntent.metadata.source
    const localSource = typeof localMetadata?.source === 'string'
        ? localMetadata.source
        : null
    const renewalRefund = !!payment.subscription ||
        ['store_renewal', 'mobile_renewal'].includes(providerSource) ||
        ['store_renewal', 'mobile_renewal'].includes(localSource || '')

    if (renewalRefund) {
        const result = await prisma.$transaction((tx) => finalizeRenewalPaymentRefund(tx, {
            charge: {
                id: charge.id,
                paymentIntentId,
                amount: charge.amount,
                amountRefunded: charge.amount_refunded,
                currency: charge.currency,
                refunded: charge.refunded,
            },
            paymentIntent: {
                id: providerPaymentIntent.id,
                status: providerPaymentIntent.status,
                amount: providerPaymentIntent.amount,
                amountReceived: providerPaymentIntent.amount_received,
                currency: providerPaymentIntent.currency,
                metadata: providerPaymentIntent.metadata,
            },
        }))
        console.log(
            `Renewal refund ${result.result}: ${result.operationId} (${result.source})`
        )
        return
    }

    // Non-renewal order refund remains atomic so the Payment and Order cannot
    // disagree when a webhook is replayed or the process exits mid-handler.
    const refundedAmount = charge.amount_refunded / 100 // Convert from cents
    const isFullRefund = charge.refunded
    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${payment.id} FOR UPDATE`
        await tx.payment.update({
            where: { id: payment.id },
            data: {
                status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
                refundedAmount,
                refundedAt: new Date(),
            }
        })
        if (payment.order && isFullRefund) {
            await tx.order.update({
                where: { id: payment.order.id },
                data: { status: 'REFUNDED' }
            })
        }
    })
    if (payment.order && isFullRefund) {
        console.log(`Order ${payment.order.orderNumber} marked as REFUNDED`)
    }
}

// Note: In Next.js App Router, body parsing is handled differently.
// We use request.text() above to get the raw body for Stripe signature verification.
