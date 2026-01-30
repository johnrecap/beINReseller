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
import { getStripeSecretKey } from '@/lib/store-pricing'
import Stripe from 'stripe'

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
                await handleRefund(event.data.object as Stripe.Charge)
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

    // Skip if already processed
    if (payment.status === 'SUCCEEDED') {
        console.log(`Payment already processed: ${paymentIntentId}`)
        return
    }

    // Update payment status
    await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED' }
    })

    // Handle based on payment type
    if (payment.type === 'ORDER' && payment.order) {
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
            await prisma.storeSubscription.update({
                where: { id: payment.subscription.id },
                data: { status: 'PAID' }
            })

            // Signal worker to continue (update operation if linked)
            if (payment.subscription.operationId) {
                await prisma.operation.update({
                    where: { id: payment.subscription.operationId },
                    data: { status: 'PROCESSING' }
                })
            }
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

    // Update payment status
    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: 'FAILED',
            failureMessage: errorMessage,
        }
    })

    // For subscriptions, we don't automatically fail - customer can retry
    // For orders, we keep status as PENDING - customer can retry payment
    console.log(`Payment ${paymentIntentId} marked as FAILED`)
}

/**
 * Handle refund
 */
async function handleRefund(charge: Stripe.Charge) {
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

    // Calculate refunded amount
    const refundedAmount = charge.amount_refunded / 100 // Convert from cents
    const isFullRefund = charge.refunded

    // Update payment status
    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            refundedAmount,
            refundedAt: new Date(),
        }
    })

    // Update order if applicable
    if (payment.order && isFullRefund) {
        await prisma.order.update({
            where: { id: payment.order.id },
            data: { status: 'REFUNDED' }
        })
        console.log(`Order ${payment.order.orderNumber} marked as REFUNDED`)
    }

    // Update subscription if applicable
    if (payment.subscription && isFullRefund) {
        await prisma.storeSubscription.update({
            where: { id: payment.subscription.id },
            data: {
                status: 'REFUNDED',
                refundedAt: new Date(),
            }
        })
        console.log(`Subscription ${payment.subscription.id} marked as REFUNDED`)
    }
}

// Note: In Next.js App Router, body parsing is handled differently.
// We use request.text() above to get the raw body for Stripe signature verification.
