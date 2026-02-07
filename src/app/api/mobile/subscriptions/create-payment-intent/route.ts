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

export const POST = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { operationId } = body

        if (!operationId) {
            return NextResponse.json(
                { success: false, error: 'معرف العملية مطلوب' },
                { status: 400 }
            )
        }

        // Get the operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId }
        })

        if (!operation) {
            return NextResponse.json(
                { success: false, error: 'العملية غير موجودة' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (operation.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'غير مصرح' },
                { status: 403 }
            )
        }

        // Check operation is awaiting payment
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { success: false, error: `العملية ليست في حالة انتظار التأكيد (${operation.status})` },
                { status: 400 }
            )
        }

        // Get selected package from operation
        const selectedPackage = operation.selectedPackage as { name: string; price: number } | null
        if (!selectedPackage || !selectedPackage.price) {
            return NextResponse.json(
                { success: false, error: 'لا توجد باقة محددة' },
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
                { success: false, error: 'نظام الدفع غير متاح حالياً' },
                { status: 500 }
            )
        }

        // Initialize Stripe
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })

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
        })

        // Update operation status
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'AWAITING_PAYMENT',
                amount: customerPrice
            }
        })

        // Create payment record for tracking
        await prisma.payment.create({
            data: {
                customerId: customer.customerId,
                stripePaymentIntentId: paymentIntent.id,
                amount: customerPrice,
                currency: currencyConfig.code,
                status: 'PENDING',
                type: 'SUBSCRIPTION',
                metadata: {
                    operationId: operation.id,
                    source: 'mobile_renewal'
                }
            }
        })

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: customerPrice,
            currency: currencyConfig.code,
            currencySymbol: currencyConfig.symbol
        })

    } catch (error) {
        console.error('Create payment intent error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في إنشاء طلب الدفع' },
            { status: 500 }
        )
    }
})
