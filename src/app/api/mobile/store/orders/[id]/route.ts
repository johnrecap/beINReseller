/**
 * GET /api/mobile/store/orders/[id]
 * 
 * Get single order details
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        // Extract order ID from URL
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/')
        const orderId = pathParts[pathParts.length - 1]

        if (!orderId) {
            return NextResponse.json(
                { success: false, error: 'معرف الطلب مطلوب' },
                { status: 400 }
            )
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    select: {
                        id: true,
                        name: true,
                        nameAr: true,
                        image: true,
                        quantity: true,
                        price: true
                    }
                }
            }
        })

        if (!order) {
            return NextResponse.json(
                { success: false, error: 'الطلب غير موجود' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (order.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'غير مصرح' },
                { status: 403 }
            )
        }

        return NextResponse.json({
            success: true,
            order: {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                currency: order.currency,
                subtotal: order.subtotal,
                shippingCost: order.shippingCost,
                discount: order.discount,
                total: order.total,
                shipping: {
                    name: order.shippingName,
                    phone: order.shippingPhone,
                    country: order.shippingCountry,
                    city: order.shippingCity,
                    address: order.shippingAddress,
                    notes: order.shippingNotes
                },
                trackingNumber: order.trackingNumber,
                items: order.items,
                createdAt: order.createdAt,
                paidAt: order.paidAt,
                processedAt: order.processedAt,
                shippedAt: order.shippedAt,
                deliveredAt: order.deliveredAt
            }
        })

    } catch (error) {
        console.error('Get order error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب الطلب' },
            { status: 500 }
        )
    }
})
