/**
 * Store Order Cancel API
 * 
 * POST - Cancel an order (if eligible)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { getStripeSecretKey } from '@/lib/store-pricing'
import Stripe from 'stripe'

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * POST /api/store/orders/[id]/cancel
 * Cancel an order and refund payment if applicable
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params

        // Authenticate customer
        const customer = getStoreCustomerFromRequest(request)
        if (!customer) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Please login to cancel order' },
                { status: 401 }
            )
        }

        // Parse body for cancel reason
        let cancelReason = 'Cancelled by customer'
        try {
            const body = await request.json()
            if (body.reason) {
                cancelReason = body.reason
            }
        } catch {
            // Body is optional
        }

        // Get order with payment
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                payment: true,
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                trackStock: true,
                            }
                        }
                    }
                }
            }
        })

        if (!order) {
            return NextResponse.json(
                { error: 'Not found', message: 'Order not found' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (order.customerId !== customer.id) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'You do not have access to this order' },
                { status: 403 }
            )
        }

        // Check if order can be cancelled
        const cancellableStatuses = ['PENDING', 'PAID', 'PROCESSING']
        if (!cancellableStatuses.includes(order.status)) {
            return NextResponse.json(
                { 
                    error: 'Cannot cancel', 
                    message: `Orders with status "${order.status}" cannot be cancelled. Please contact support.` 
                },
                { status: 400 }
            )
        }

        // Check if already shipped
        if (order.shippedAt) {
            return NextResponse.json(
                { 
                    error: 'Cannot cancel', 
                    message: 'Order has already been shipped. Please contact support for return/refund.' 
                },
                { status: 400 }
            )
        }

        // Handle refund if payment was made
        let refunded = false
        if (order.payment && order.payment.status === 'SUCCEEDED') {
            const stripeSecretKey = await getStripeSecretKey()
            if (stripeSecretKey) {
                try {
                    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })
                    
                    // Create full refund
                    await stripe.refunds.create({
                        payment_intent: order.payment.stripePaymentIntentId,
                        reason: 'requested_by_customer',
                    })
                    
                    refunded = true
                } catch (stripeError) {
                    console.error('Stripe refund error:', stripeError)
                    // Continue with cancellation even if refund fails
                    // Admin can handle manual refund
                }
            }
        } else if (order.payment && order.payment.status === 'PENDING') {
            // Cancel payment intent if not yet paid
            const stripeSecretKey = await getStripeSecretKey()
            if (stripeSecretKey) {
                try {
                    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })
                    await stripe.paymentIntents.cancel(order.payment.stripePaymentIntentId)
                } catch (stripeError) {
                    console.error('Stripe cancel error:', stripeError)
                    // Continue anyway
                }
            }
        }

        // Perform cancellation in transaction
        const updatedOrder = await prisma.$transaction(async (tx) => {
            // Update order status
            const cancelled = await tx.order.update({
                where: { id },
                data: {
                    status: refunded ? 'REFUNDED' : 'CANCELLED',
                    cancelledAt: new Date(),
                    cancelReason,
                },
            })

            // Restore stock for each item
            for (const item of order.items) {
                if (item.product.trackStock) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: {
                            stock: { increment: item.quantity }
                        }
                    })
                }
            }

            // Update payment status if exists
            if (order.payment) {
                await tx.payment.update({
                    where: { id: order.payment.id },
                    data: {
                        status: refunded ? 'REFUNDED' : 'CANCELLED',
                        refundedAmount: refunded ? order.total : null,
                        refundedAt: refunded ? new Date() : null,
                    }
                })
            }

            return cancelled
        })

        return NextResponse.json({
            success: true,
            message: refunded 
                ? 'Order cancelled and refund initiated. It may take 5-10 business days to reflect in your account.'
                : 'Order cancelled successfully.',
            messageAr: refunded
                ? 'Order cancelled and refund initiated. It may take 5-10 business days to appear in your account.'
                : 'Order cancelled successfully.',
            data: {
                order: {
                    id: updatedOrder.id,
                    orderNumber: updatedOrder.orderNumber,
                    status: updatedOrder.status,
                    cancelledAt: updatedOrder.cancelledAt,
                    cancelReason: updatedOrder.cancelReason,
                    refunded,
                }
            }
        })

    } catch (error) {
        console.error('Error cancelling order:', error)
        return NextResponse.json(
            { error: 'Internal server error', message: 'Failed to cancel order' },
            { status: 500 }
        )
    }
}
