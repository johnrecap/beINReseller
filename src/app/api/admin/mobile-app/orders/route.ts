/**
 * GET /api/admin/mobile-app/orders
 * 
 * List orders with status filter
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json(
                { success: false, error: authResult.error },
                { status: authResult.status }
            )
        }

        const { searchParams } = new URL(request.url)

        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        const status = searchParams.get('status')

        const where: Record<string, unknown> = {}
        if (status) where.status = status

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    customer: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    _count: {
                        select: { items: true }
                    }
                }
            }),
            prisma.order.count({ where })
        ])

        const formattedOrders = orders.map(order => ({
            id: order.id,
            orderNumber: order.orderNumber,
            customerId: order.customerId,
            customerName: order.customer?.name || 'Unknown',
            status: order.status,
            currency: order.currency,
            total: order.total,
            itemCount: order._count.items,
            trackingNumber: order.trackingNumber,
            createdAt: order.createdAt.toISOString()
        }))

        const totalPages = Math.ceil(total / limit)

        return NextResponse.json({
            success: true,
            orders: formattedOrders,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        })

    } catch (error) {
        console.error('Admin get orders error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
