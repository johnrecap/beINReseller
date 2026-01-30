/**
 * Store Subscription Select Package
 * POST /api/store/subscriptions/[id]/select-package
 * 
 * Customer selects a package from beIN. Creates Stripe PaymentIntent.
 * Returns clientSecret for payment.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { calculateCustomerPrice, toStripeAmount, CURRENCY_CONFIG, getStripeSecretKey } from '@/lib/store-pricing'

interface RouteParams {
    params: Promise<{ id: string }>
}

interface AvailablePackage {
    index: number
    name: string
    price: number
    checkboxSelector?: string
}

// Validation schema
const selectPackageSchema = z.object({
    packageIndex: z.number().int().min(0),
    useStoreCredit: z.boolean().optional().default(true), // Use store credit if available
})

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        const body = await request.json()
        
        // 2. Validate input
        const result = selectPackageSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { packageIndex, useStoreCredit } = result.data
        
        // 3. Get subscription with operation
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: {
                        id: true,
                        status: true,
                        availablePackages: true,
                    }
                },
                customer: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        storeCredit: true,
                        country: true,
                    }
                }
            }
        })
        
        if (!subscription) {
            return errorResponse('الاشتراك غير موجود', 404, 'NOT_FOUND')
        }
        
        // 4. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('غير مصرح بالوصول لهذا الاشتراك', 403, 'FORBIDDEN')
        }
        
        // 5. Check status
        if (subscription.status !== 'AWAITING_PACKAGE') {
            return errorResponse('الاشتراك ليس في مرحلة اختيار الباقة', 400, 'INVALID_STATUS')
        }
        
        // 6. Validate package selection
        const packages = subscription.operation?.availablePackages as AvailablePackage[] | null
        if (!packages || !Array.isArray(packages)) {
            return errorResponse('لا توجد باقات متاحة', 400, 'NO_PACKAGES')
        }
        
        const selectedPackage = packages.find(p => p.index === packageIndex)
        if (!selectedPackage) {
            return errorResponse('الباقة المختارة غير موجودة', 400, 'PACKAGE_NOT_FOUND')
        }
        
        // 7. Calculate prices
        const beinPrice = selectedPackage.price
        const customerPrice = calculateCustomerPrice(beinPrice, subscription.markupPercent)
        
        // 8. Calculate store credit usage
        const availableCredit = subscription.customer?.storeCredit || 0
        let creditUsed = 0
        let amountToPay = customerPrice
        
        if (useStoreCredit && availableCredit > 0) {
            creditUsed = Math.min(availableCredit, customerPrice)
            amountToPay = customerPrice - creditUsed
        }
        
        // 9. Get Stripe configuration
        const stripeSecretKey = await getStripeSecretKey()
        if (!stripeSecretKey && amountToPay > 0) {
            return errorResponse('نظام الدفع غير مفعل حالياً', 500, 'STRIPE_NOT_CONFIGURED')
        }
        
        const country = (subscription.customer?.country as 'SA' | 'EG') || 'SA'
        const currencyConfig = CURRENCY_CONFIG[country]
        
        // 10. Create Stripe PaymentIntent if payment is needed
        let stripePaymentIntentId: string | null = null
        let clientSecret: string | null = null
        
        if (amountToPay > 0 && stripeSecretKey) {
            const stripe = new Stripe(stripeSecretKey)
            
            const paymentIntent = await stripe.paymentIntents.create({
                amount: toStripeAmount(amountToPay, country),
                currency: currencyConfig.stripeCode,
                metadata: {
                    subscriptionId: subscription.id,
                    customerId: customer.id,
                    customerEmail: subscription.customer?.email || '',
                    packageName: selectedPackage.name,
                    beinPrice: beinPrice.toString(),
                    customerPrice: customerPrice.toString(),
                    creditUsed: creditUsed.toString(),
                },
                description: `beIN Subscription: ${selectedPackage.name}`,
            })
            
            stripePaymentIntentId = paymentIntent.id
            clientSecret = paymentIntent.client_secret
        }
        
        // 11. Update subscription and operation
        await prisma.$transaction([
            prisma.storeSubscription.update({
                where: { id: subscription.id },
                data: {
                    status: 'AWAITING_PAYMENT',
                    packageName: selectedPackage.name,
                    packagePrice: beinPrice,
                    price: customerPrice,
                    creditUsed,
                    stripePaymentIntentId,
                }
            }),
            prisma.operation.update({
                where: { id: subscription.operation!.id },
                data: {
                    selectedPackage: JSON.parse(JSON.stringify(selectedPackage)),
                    amount: beinPrice, // beIN price for the operation
                }
            }),
            // Deduct store credit if used
            ...(creditUsed > 0 ? [
                prisma.customer.update({
                    where: { id: customer.id },
                    data: {
                        storeCredit: { decrement: creditUsed }
                    }
                })
            ] : [])
        ])
        
        // 12. If no payment needed (fully covered by credit), proceed immediately
        if (amountToPay === 0) {
            // Payment is fully covered by store credit
            // Update status to PAID and continue
            await prisma.storeSubscription.update({
                where: { id: subscription.id },
                data: { status: 'PAID' }
            })
            
            return successResponse({
                subscriptionId: subscription.id,
                status: 'PAID',
                packageName: selectedPackage.name,
                price: customerPrice,
                creditUsed,
                amountToPay: 0,
                message: 'تم استخدام رصيدك لتغطية كامل المبلغ. جاري إتمام العملية...',
            })
        }
        
        // 13. Return payment info
        return successResponse({
            subscriptionId: subscription.id,
            status: 'AWAITING_PAYMENT',
            packageName: selectedPackage.name,
            price: customerPrice,
            creditUsed,
            amountToPay,
            currency: currencyConfig.code,
            clientSecret,
            message: 'يرجى إتمام الدفع لإكمال العملية',
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
