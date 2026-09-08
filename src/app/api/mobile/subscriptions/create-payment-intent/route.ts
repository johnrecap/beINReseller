/**
 * POST /api/mobile/subscriptions/create-payment-intent
 * 
 * Create Stripe PaymentIntent for subscription renewal
 * - Validate operation is in AWAITING_FINAL_CONFIRM status
 * - Apply markup to package price
 * - Create Stripe PaymentIntent
 * - Return clientSecret to app
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'
import { getStripeSecretKey, getMarkupPercentage, calculateCustomerPrice, toStripeAmount, CURRENCY_CONFIG } from '@/lib/store-pricing'
import Stripe from 'stripe'
import {
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'
import {
    isMobileRenewalPaymentSafetyError,
    MobileRenewalProviderPayment,
    persistMobileRenewalPaymentIntent,
} from '@/lib/mobile-renewal-payment-finalization'

const REUSABLE_PAYMENT_INTENT_STATUSES = new Set<Stripe.PaymentIntent.Status>([
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'requires_capture',
    'processing',
])

const PAYMENT_INTENT_REVIEW_REQUIRED_RESPONSE = {
    success: false,
    code: 'PAYMENT_INTENT_REVIEW_REQUIRED',
    error: 'An existing payment attempt must be reviewed before retrying.',
} as const

function providerPaymentSnapshot(paymentIntent: Stripe.PaymentIntent): MobileRenewalProviderPayment {
    return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        amountReceived: paymentIntent.amount_received,
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata,
    }
}

export const POST = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { operationId } = body

        if (!operationId) {
            return NextResponse.json(
                { success: false, error: 'Operation ID is required' },
                { status: 400 }
            )
        }

        // Get the operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId }
        })

        if (!operation) {
            return NextResponse.json(
                { success: false, error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (operation.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 403 }
            )
        }

        // Check operation is awaiting payment
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { success: false, error: `Operation is not awaiting confirmation (${operation.status})` },
                { status: 400 }
            )
        }

        await prisma.$transaction((tx) => ensureGuardedRenewalOperationReservation(tx, {
            operationId: operation.id,
            cardNumber: operation.cardNumber,
        }))

        // Get selected package from operation
        const selectedPackage = operation.selectedPackage as { name: string; price: number } | null
        if (!selectedPackage || !selectedPackage.price) {
            return NextResponse.json(
                { success: false, error: 'No package selected' },
                { status: 400 }
            )
        }

        // Get customer for currency determination
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.customerId },
            select: { country: true }
        })

        const country = (customerData?.country as 'SA' | 'EG') || 'SA'
        const currencyConfig = CURRENCY_CONFIG[country]

        // Apply markup
        const markupPercent = await getMarkupPercentage()
        const customerPrice = calculateCustomerPrice(selectedPackage.price, markupPercent)

        // Get Stripe secret key
        const stripeSecretKey = await getStripeSecretKey()
        if (!stripeSecretKey) {
            return NextResponse.json(
                { success: false, error: 'Payment system is currently unavailable' },
                { status: 500 }
            )
        }

        // Initialize Stripe
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })

        const existingPayments = await prisma.payment.findMany({
            where: {
                type: 'SUBSCRIPTION',
                metadata: {
                    path: ['operationId'],
                    equals: operation.id,
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 2,
        })

        if (existingPayments.length > 1) {
            return NextResponse.json(
                PAYMENT_INTENT_REVIEW_REQUIRED_RESPONSE,
                { status: 409 }
            )
        }

        const existingPayment = existingPayments[0]
        if (existingPayment) {
            const existingIntent = await stripe.paymentIntents.retrieve(
                existingPayment.stripePaymentIntentId
            )
            const persistence = await prisma.$transaction((tx) =>
                persistMobileRenewalPaymentIntent(tx, {
                    provider: providerPaymentSnapshot(existingIntent),
                    operationId: operation.id,
                    customerId: customer.customerId,
                    cardNumber: operation.cardNumber,
                    packageName: selectedPackage.name,
                    beinPrice: selectedPackage.price,
                    customerPrice,
                    currency: currencyConfig.code,
                })
            )
            if (
                persistence === 'ALREADY_PERSISTED' &&
                REUSABLE_PAYMENT_INTENT_STATUSES.has(existingIntent.status) &&
                existingIntent.client_secret
            ) {
                return NextResponse.json({
                    success: true,
                    clientSecret: existingIntent.client_secret,
                    paymentIntentId: existingIntent.id,
                    amount: existingPayment.amount,
                    currency: existingPayment.currency,
                    currencySymbol: currencyConfig.symbol,
                    reused: true,
                })
            }

            return NextResponse.json(
                PAYMENT_INTENT_REVIEW_REQUIRED_RESPONSE,
                { status: 409 }
            )
        }

        // Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: toStripeAmount(customerPrice, country),
            currency: currencyConfig.stripeCode,
            metadata: {
                source: 'mobile_renewal',
                operationId: operation.id,
                customerId: customer.customerId,
                packageName: selectedPackage.name,
                beinPrice: selectedPackage.price.toString(),
                customerPrice: customerPrice.toString()
            }
        }, {
            idempotencyKey: `mobile-renewal:${operation.id}`,
        })

        // The second guarded transaction records the exact provider/local link.
        // If operation or package state changed during Stripe I/O, it records the
        // attempt for audit but never moves the operation back to a payment state.
        const persistence = await prisma.$transaction((tx) =>
            persistMobileRenewalPaymentIntent(tx, {
                provider: providerPaymentSnapshot(paymentIntent),
                operationId: operation.id,
                customerId: customer.customerId,
                cardNumber: operation.cardNumber,
                packageName: selectedPackage.name,
                beinPrice: selectedPackage.price,
                customerPrice,
                currency: currencyConfig.code,
            })
        )
        if (
            persistence === 'RECORDED_REVIEW_REQUIRED' ||
            !REUSABLE_PAYMENT_INTENT_STATUSES.has(paymentIntent.status) ||
            !paymentIntent.client_secret
        ) {
            return NextResponse.json(
                PAYMENT_INTENT_REVIEW_REQUIRED_RESPONSE,
                { status: 409 }
            )
        }

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: customerPrice,
            currency: currencyConfig.code,
            currencySymbol: currencyConfig.symbol
        })

    } catch (error) {
        if (isRenewalCreationBlockedError(error)) {
            return NextResponse.json(
                { success: false, ...renewalCreationBlockedPayload(error) },
                { status: 409 }
            )
        }
        if (isMobileRenewalPaymentSafetyError(error)) {
            return NextResponse.json(
                PAYMENT_INTENT_REVIEW_REQUIRED_RESPONSE,
                { status: 409 }
            )
        }
        console.error('Create payment intent error:', error)
        return NextResponse.json(
            { success: false, error: 'Error creating payment request' },
            { status: 500 }
        )
    }
})
