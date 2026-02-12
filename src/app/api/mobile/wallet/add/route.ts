/**
 * POST /api/mobile/wallet/add
 * 
 * Add balance to wallet using Stripe
 * - Validate amount (min/max)
 * - Create Stripe PaymentIntent
 * - Return clientSecret
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

// Lazy-load Stripe to avoid build errors when env vars are not set
let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
    if (!stripeInstance) {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error('STRIPE_SECRET_KEY is not configured')
        }
        stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2026-01-28.clover'
        })
    }
    return stripeInstance
}

// Configuration from settings (with defaults)
const MIN_TOPUP = 10    // SAR/EGP
const MAX_TOPUP = 1000  // SAR/EGP
const MAX_BALANCE = 5000 // Maximum wallet balance

export const POST = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { amount } = body

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid amount' },
                { status: 400 }
            )
        }

        // Load settings for min/max
        const settings = await prisma.setting.findMany({
            where: { key: { in: ['wallet_min_topup', 'wallet_max_topup', 'wallet_max_balance'] } }
        })

        const minTopup = parseFloat(settings.find(s => s.key === 'wallet_min_topup')?.value || String(MIN_TOPUP))
        const maxTopup = parseFloat(settings.find(s => s.key === 'wallet_max_topup')?.value || String(MAX_TOPUP))
        const maxBalance = parseFloat(settings.find(s => s.key === 'wallet_max_balance')?.value || String(MAX_BALANCE))

        if (amount < minTopup) {
            return NextResponse.json(
                { success: false, error: `Minimum top-up amount is ${minTopup}` },
                { status: 400 }
            )
        }

        if (amount > maxTopup) {
            return NextResponse.json(
                { success: false, error: `Maximum top-up amount is ${maxTopup}` },
                { status: 400 }
            )
        }

        // Get customer data
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.customerId },
            select: {
                walletBalance: true,
                stripeCustomerId: true,
                country: true,
                email: true,
                name: true
            }
        })

        if (!customerData) {
            return NextResponse.json(
                { success: false, error: 'Account not found' },
                { status: 404 }
            )
        }

        // Check max balance
        if (customerData.walletBalance + amount > maxBalance) {
            return NextResponse.json(
                { success: false, error: `Maximum balance is ${maxBalance}` },
                { status: 400 }
            )
        }

        // Determine currency based on country
        const currency = customerData.country === 'EG' ? 'egp' : 'sar'

        // Create or get Stripe customer
        let stripeCustomerId = customerData.stripeCustomerId

        if (!stripeCustomerId) {
            const stripeCustomer = await getStripe().customers.create({
                email: customerData.email,
                name: customerData.name,
                metadata: {
                    customerId: customer.customerId
                }
            })
            stripeCustomerId = stripeCustomer.id

            // Save Stripe customer ID
            await prisma.customer.update({
                where: { id: customer.customerId },
                data: { stripeCustomerId }
            })
        }

        // Create PaymentIntent
        const paymentIntent = await getStripe().paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to smallest currency unit
            currency,
            customer: stripeCustomerId,
            metadata: {
                customerId: customer.customerId,
                type: 'wallet_topup',
                amount: String(amount)
            },
            automatic_payment_methods: {
                enabled: true
            }
        })

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount,
            currency: currency.toUpperCase()
        })

    } catch (error) {
        console.error('Wallet add error:', error)
        return NextResponse.json(
            { success: false, error: 'Error creating payment operation' },
            { status: 500 }
        )
    }
})
