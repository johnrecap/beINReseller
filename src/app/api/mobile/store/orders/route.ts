/**
 * POST /api/mobile/store/orders
 * GET /api/mobile/store/orders
 * 
 * Create order / Get customer orders
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

interface OrderItemInput {
    productId: string
    quantity: number
}

interface ShippingInfo {
    name: string
    phone: string
    country: string
    city: string
    address: string
    notes?: string
}

/**
 * POST - Create a new order
 */
export const POST = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { items, shipping } = body as { items: OrderItemInput[], shipping: ShippingInfo }

        // Validate input
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: 'يجب تحديد منتج واحد على الأقل' },
                { status: 400 }
            )
        }

        if (!shipping || !shipping.name || !shipping.phone || !shipping.city || !shipping.address) {
            return NextResponse.json(
                { success: false, error: 'معلومات الشحن مطلوبة' },
                { status: 400 }
            )
        }

        // Determine currency
        const currency = customer.country === 'EG' ? 'EGP' : 'SAR'
        const priceField = currency === 'EGP' ? 'priceEGP' : 'priceSAR'

        // Get products and validate stock
        const productIds = items.map(item => item.productId)
        const products = await prisma.product.findMany({
            where: {
                id: { in: productIds },
                isActive: true
            }
        })

        if (products.length !== productIds.length) {
            return NextResponse.json(
                { success: false, error: 'بعض المنتجات غير متوفرة' },
                { status: 400 }
            )
        }

        // Validate stock and calculate subtotal
        let subtotal = 0
        const orderItems: { productId: string; quantity: number; price: number; product: typeof products[0] }[] = []

        for (const item of items) {
            const product = products.find(p => p.id === item.productId)!
            const quantity = Math.max(1, item.quantity)

            // Check stock
            if (product.trackStock && product.stock < quantity) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `الكمية المطلوبة من "${product.nameAr}" غير متوفرة`,
                        code: 'OUT_OF_STOCK',
                        productId: product.id
                    },
                    { status: 400 }
                )
            }

            const price = product[priceField]
            subtotal += price * quantity
            orderItems.push({ productId: product.id, quantity, price, product })
        }

        // Get shipping cost from settings
        const shippingSetting = await prisma.setting.findUnique({
            where: { key: `shipping_cost_${currency.toLowerCase()}` }
        })
        const shippingCost = parseFloat(shippingSetting?.value || '0')

        const total = subtotal + shippingCost

        // Check wallet balance
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.customerId },
            select: { walletBalance: true, storeCredit: true }
        })

        if (!customerData) {
            return NextResponse.json(
                { success: false, error: 'الحساب غير موجود' },
                { status: 404 }
            )
        }

        const totalAvailable = customerData.walletBalance + customerData.storeCredit

        if (totalAvailable < total) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'الرصيد غير كافي',
                    code: 'INSUFFICIENT_BALANCE',
                    required: total,
                    available: totalAvailable
                },
                { status: 400 }
            )
        }

        // Generate order number
        const date = new Date()
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
        const orderNumber = `ORD-${dateStr}-${randomSuffix}`

        // Create order in transaction
        const order = await prisma.$transaction(async (tx) => {
            // Deduct from wallet
            let creditDeduction = Math.min(customerData.storeCredit, total)
            let walletDeduction = total - creditDeduction
            const balanceBefore = customerData.walletBalance

            await tx.customer.update({
                where: { id: customer.customerId },
                data: {
                    storeCredit: { decrement: creditDeduction },
                    walletBalance: { decrement: walletDeduction }
                }
            })

            // Create wallet transaction
            await tx.walletTransaction.create({
                data: {
                    customerId: customer.customerId,
                    type: 'DEBIT',
                    amount: total,
                    balanceBefore,
                    balanceAfter: balanceBefore - walletDeduction,
                    description: `طلب #${orderNumber}`,
                    referenceType: 'ORDER'
                }
            })

            // Reduce stock for tracked products
            for (const item of orderItems) {
                if (item.product.trackStock) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: { decrement: item.quantity } }
                    })
                }
            }

            // Create order
            const newOrder = await tx.order.create({
                data: {
                    customerId: customer.customerId,
                    orderNumber,
                    status: 'PENDING',
                    currency,
                    subtotal,
                    shippingCost,
                    total,
                    shippingName: shipping.name,
                    shippingPhone: shipping.phone,
                    shippingCountry: shipping.country || customer.country,
                    shippingCity: shipping.city,
                    shippingAddress: shipping.address,
                    shippingNotes: shipping.notes || null,
                    paidAt: new Date(),
                    items: {
                        create: orderItems.map(item => ({
                            productId: item.productId,
                            name: item.product.name,
                            nameAr: item.product.nameAr,
                            image: item.product.images[0] || null,
                            quantity: item.quantity,
                            price: item.price
                        }))
                    }
                },
                include: {
                    items: true
                }
            })

            // Update wallet transaction with order reference
            await tx.walletTransaction.updateMany({
                where: {
                    customerId: customer.customerId,
                    referenceType: 'ORDER',
                    description: `طلب #${orderNumber}`
                },
                data: { referenceId: newOrder.id }
            })

            return newOrder
        })

        return NextResponse.json({
            success: true,
            message: 'تم إنشاء الطلب بنجاح',
            order: {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                total: order.total,
                currency: order.currency,
                itemCount: order.items.length
            }
        })

    } catch (error) {
        console.error('Create order error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في إنشاء الطلب' },
            { status: 500 }
        )
    }
})

/**
 * GET - Get customer's orders
 */
export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const { searchParams } = new URL(request.url)

        // Pagination
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where: { customerId: customer.customerId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    currency: true,
                    total: true,
                    createdAt: true,
                    _count: {
                        select: { items: true }
                    }
                }
            }),
            prisma.order.count({ where: { customerId: customer.customerId } })
        ])

        const totalPages = Math.ceil(total / limit)

        return NextResponse.json({
            success: true,
            orders: orders.map(order => ({
                ...order,
                itemCount: order._count.items,
                _count: undefined
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        })

    } catch (error) {
        console.error('Get orders error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب الطلبات' },
            { status: 500 }
        )
    }
})
