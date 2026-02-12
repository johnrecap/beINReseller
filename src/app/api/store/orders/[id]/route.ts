/**
 * Store Order Details API
 * 
 * GET - Get single order details
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * GET /api/store/orders/[id]
 * Get order details with all items and shipping info
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params

        // Authenticate customer
        const customer = getStoreCustomerFromRequest(request)
        if (!customer) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Please login to view order details' },
                { status: 401 }
            )
        }

        // Get order with all details
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                images: true,
                                isActive: true,
                            }
                        }
                    }
                },
                payment: {
                    select: {
                        id: true,
                        status: true,
                        stripePaymentIntentId: true,
                        amount: true,
                        currency: true,
                        createdAt: true,
                    }
                },
                address: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        country: true,
                        city: true,
                        district: true,
                        street: true,
                        building: true,
                        floor: true,
                        apartment: true,
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

        // Build status timeline
        const timeline: Array<{ status: string; date: Date | null; label: string; labelAr: string }> = [
            {
                status: 'PENDING',
                date: order.createdAt,
                label: 'Order Placed',
                labelAr: 'Order Created',
            },
            {
                status: 'PAID',
                date: order.paidAt,
                label: 'Payment Received',
                labelAr: 'Payment Received',
            },
            {
                status: 'PROCESSING',
                date: order.processedAt,
                label: 'Processing',
                labelAr: 'Processing',
            },
            {
                status: 'SHIPPED',
                date: order.shippedAt,
                label: 'Shipped',
                labelAr: 'Shipped',
            },
            {
                status: 'DELIVERED',
                date: order.deliveredAt,
                label: 'Delivered',
                labelAr: 'Delivered',
            },
        ]

        // Add cancelled if applicable
        if (order.cancelledAt) {
            timeline.push({
                status: 'CANCELLED',
                date: order.cancelledAt,
                label: 'Cancelled',
                labelAr: 'Cancelled',
            })
        }

        return NextResponse.json({
            success: true,
            data: {
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    currency: order.currency,
                    subtotal: order.subtotal,
                    shippingCost: order.shippingCost,
                    discount: order.discount,
                    total: order.total,
                    
                    // Items
                    items: order.items.map(item => ({
                        id: item.id,
                        productId: item.productId,
                        name: item.name,
                        nameAr: item.nameAr,
                        quantity: item.quantity,
                        price: item.price,
                        totalPrice: item.price * item.quantity,
                        image: item.image || (item.product.images.length > 0 ? item.product.images[0] : null),
                        productAvailable: item.product.isActive,
                    })),
                    
                    // Shipping
                    shipping: {
                        name: order.shippingName,
                        phone: order.shippingPhone,
                        country: order.shippingCountry,
                        city: order.shippingCity,
                        address: order.shippingAddress,
                        notes: order.shippingNotes,
                        trackingNumber: order.trackingNumber,
                    },
                    
                    // Saved address reference
                    addressId: order.addressId,
                    savedAddress: order.address,
                    
                    // Payment
                    payment: order.payment ? {
                        id: order.payment.id,
                        status: order.payment.status,
                        amount: order.payment.amount,
                        currency: order.payment.currency,
                        paidAt: order.paidAt,
                    } : null,
                    
                    // Timeline
                    timeline: timeline.filter(t => t.date !== null),
                    
                    // Flags
                    canCancel: ['PENDING', 'PAID'].includes(order.status),
                    canRefund: order.status === 'PAID' && !order.shippedAt,
                    
                    // Cancel info
                    cancelReason: order.cancelReason,
                    
                    // Dates
                    createdAt: order.createdAt,
                    updatedAt: order.updatedAt,
                    paidAt: order.paidAt,
                    processedAt: order.processedAt,
                    shippedAt: order.shippedAt,
                    deliveredAt: order.deliveredAt,
                    cancelledAt: order.cancelledAt,
                }
            }
        })

    } catch (error) {
        console.error('Error fetching order:', error)
        return NextResponse.json(
            { error: 'Internal server error', message: 'Failed to fetch order details' },
            { status: 500 }
        )
    }
}
