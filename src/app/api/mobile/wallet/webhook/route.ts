/**
 * POST /api/mobile/wallet/webhook
 * 
 * Stripe webhook handler for wallet top-ups
 * - Verify Stripe signature
 * - Handle payment_intent.succeeded
 * - Update customer walletBalance
 * - Create WalletTransaction
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-01-28.clover'
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

export async function POST(request: NextRequest) {
    try {
        const body = await request.text()
        const signature = request.headers.get('stripe-signature')

        if (!signature) {
            return NextResponse.json(
                { error: 'Missing stripe-signature header' },
                { status: 400 }
            )
        }

        // Verify webhook signature
        let event: Stripe.Event

        try {
            event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
        } catch (err) {
            console.error('Webhook signature verification failed:', err)
            return NextResponse.json(
                { error: 'Webhook signature verification failed' },
                { status: 400 }
            )
        }

        // Handle the event
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
                break

            case 'payment_intent.payment_failed':
                await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
                break

            default:
                console.log(`Unhandled event type: ${event.type}`)
        }

        return NextResponse.json({ received: true })

    } catch (error) {
        console.error('Webhook error:', error)
        return NextResponse.json(
            { error: 'Webhook handler failed' },
            { status: 500 }
        )
    }
}

/**
 * Handle successful payment - add balance to wallet
 */
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const { customerId, type, amount: amountStr } = paymentIntent.metadata

    // Only process wallet top-ups
    if (type !== 'wallet_topup') {
        console.log(`Skipping non-wallet payment: ${paymentIntent.id}`)
        return
    }

    if (!customerId || !amountStr) {
        console.error('Missing metadata in PaymentIntent:', paymentIntent.id)
        return
    }

    const amount = parseFloat(amountStr)

    // Check if already processed (idempotency)
    const existingTransaction = await prisma.walletTransaction.findFirst({
        where: { stripePaymentIntentId: paymentIntent.id }
    })

    if (existingTransaction) {
        console.log(`Payment already processed: ${paymentIntent.id}`)
        return
    }

    // Get customer and update balance in a transaction
    await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
            where: { id: customerId },
            select: { walletBalance: true }
        })

        if (!customer) {
            throw new Error(`Customer not found: ${customerId}`)
        }

        const balanceBefore = customer.walletBalance
        const balanceAfter = balanceBefore + amount

        // Update wallet balance
        await tx.customer.update({
            where: { id: customerId },
            data: { walletBalance: balanceAfter }
        })

        // Create transaction record
        await tx.walletTransaction.create({
            data: {
                customerId,
                type: 'CREDIT',
                amount,
                balanceBefore,
                balanceAfter,
                description: `شحن رصيد - Stripe`,
                referenceType: 'PAYMENT',
                referenceId: paymentIntent.id,
                stripePaymentIntentId: paymentIntent.id
            }
        })

        console.log(`✅ Wallet topped up: ${customerId} +${amount} (${balanceBefore} → ${balanceAfter})`)
    })
}

/**
 * Handle failed payment - log for debugging
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const { customerId, type } = paymentIntent.metadata

    if (type !== 'wallet_topup') return

    console.error(`❌ Payment failed for customer ${customerId}: ${paymentIntent.id}`)
    console.error(`Last error: ${paymentIntent.last_payment_error?.message}`)
}
