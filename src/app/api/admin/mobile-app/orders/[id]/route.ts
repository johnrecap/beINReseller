/**
 * GET/PUT /api/admin/mobile-app/orders/[id]
 * 
 * Get order details or update order status/tracking
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                items: {
                    include: {
                        product: {
                            select: {
                                name: true,
                                nameAr: true,
                                images: true
                            }
                        }
                    }
                }
            }
        })

        if (!order) {
            return NextResponse.json(
                { success: false, error: 'Order not found' },
                { status: 404 }
            )
        }

        // Format response
        const formattedOrder = {
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
            items: order.items.map(item => ({
                id: item.id,
                name: item.product?.name || '',
                nameAr: item.product?.nameAr || '',
                image: (item.product?.images as string[] | null)?.[0] || null,
                quantity: item.quantity,
                price: item.price
            })),
            createdAt: order.createdAt.toISOString(),
            paidAt: order.paidAt?.toISOString() || null,
            processedAt: order.processedAt?.toISOString() || null,
            shippedAt: order.shippedAt?.toISOString() || null,
            deliveredAt: order.deliveredAt?.toISOString() || null,
            customer: order.customer
        }

        return NextResponse.json({
            success: true,
            order: formattedOrder
        })

    } catch (error) {
        console.error('Admin get order error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params
        const body = await request.json()
        const { status, trackingNumber } = body as {
            status?: string
            trackingNumber?: string
        }

        // Build update data
        const updateData: Record<string, unknown> = {}

        if (status) {
            const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
            if (!validStatuses.includes(status)) {
                return NextResponse.json(
                    { success: false, error: 'Invalid status' },
                    { status: 400 }
                )
            }
            updateData.status = status

            // Set timestamp based on status
            if (status === 'PROCESSING') updateData.processedAt = new Date()
            if (status === 'SHIPPED') updateData.shippedAt = new Date()
            if (status === 'DELIVERED') updateData.deliveredAt = new Date()
        }

        if (trackingNumber !== undefined) {
            updateData.trackingNumber = trackingNumber || null
        }

        const updated = await prisma.order.update({
            where: { id },
            data: updateData
        })

        return NextResponse.json({
            success: true,
            order: updated
        })

    } catch (error) {
        console.error('Admin update order error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
