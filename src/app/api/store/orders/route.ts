/**
 * Store Orders API
 * 
 * GET  - List customer's orders (paginated)
 * POST - Create new order with Stripe payment
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { toStripeAmount, CURRENCY_CONFIG, getStripeSecretKey } from '@/lib/store-pricing'
import Stripe from 'stripe'

/**
 * GET /api/store/orders
 * List customer's orders with pagination
 */
export async function GET(request: NextRequest) {
    try {
        // Authenticate customer
        const customer = getStoreCustomerFromRequest(request)
        if (!customer) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Please login to view your orders' },
                { status: 401 }
            )
        }

        // Parse query parameters
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')
        const status = searchParams.get('status')
        const skip = (page - 1) * limit

        // Build filter
        const where: Record<string, unknown> = {
            customerId: customer.id,
        }

        if (status) {
            where.status = status
        }

        // Get orders with items
        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    items: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    images: true,
                                }
                            }
                        }
                    },
                    payment: {
                        select: {
                            id: true,
                            status: true,
                            stripePaymentIntentId: true,
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.order.count({ where }),
        ])

        return NextResponse.json({
            success: true,
            data: {
                orders: orders.map(order => ({
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    currency: order.currency,
                    subtotal: order.subtotal,
                    shippingCost: order.shippingCost,
                    discount: order.discount,
                    total: order.total,
                    itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
                    items: order.items.map(item => ({
                        id: item.id,
                        name: item.name,
                        nameAr: item.nameAr,
                        quantity: item.quantity,
                        price: item.price,
                        image: item.image || (item.product.images.length > 0 ? item.product.images[0] : null),
                    })),
                    shippingCity: order.shippingCity,
                    shippingCountry: order.shippingCountry,
                    trackingNumber: order.trackingNumber,
                    paymentStatus: order.payment?.status || null,
                    createdAt: order.createdAt,
                    paidAt: order.paidAt,
                    shippedAt: order.shippedAt,
                    deliveredAt: order.deliveredAt,
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                }
            }
        })

    } catch (error) {
        console.error('Error fetching orders:', error)
        return NextResponse.json(
            { error: 'Internal server error', message: 'Failed to fetch orders' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/store/orders
 * Create a new order with Stripe payment
 */
export async function POST(request: NextRequest) {
    try {
        // Authenticate customer
        const customer = getStoreCustomerFromRequest(request)
        if (!customer) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Please login to create an order' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { items, addressId, shippingNotes } = body

        // Validate items
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Cart items are required' },
                { status: 400 }
            )
        }

        // Validate address
        if (!addressId) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Shipping address is required' },
                { status: 400 }
            )
        }

        // Get customer with address
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.id },
            include: {
                addresses: {
                    where: { id: addressId }
                }
            }
        })

        if (!customerData) {
            return NextResponse.json(
                { error: 'Not found', message: 'Customer not found' },
                { status: 404 }
            )
        }

        const address = customerData.addresses[0]
        if (!address) {
            return NextResponse.json(
                { error: 'Not found', message: 'Address not found' },
                { status: 404 }
            )
        }

        // Get products and validate stock
        const productIds = items.map((item: { productId: string }) => item.productId)
        const products = await prisma.product.findMany({
            where: {
                id: { in: productIds },
                isActive: true,
            }
        })

        if (products.length !== productIds.length) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Some products are not available' },
                { status: 400 }
            )
        }

        // Map products for easy lookup
        const productMap = new Map(products.map(p => [p.id, p]))

        // Determine currency based on customer country
        const country = (address.country === 'EG' ? 'EG' : 'SA') as 'SA' | 'EG'
        const currency = CURRENCY_CONFIG[country].code

        // Calculate totals and validate stock
        let subtotal = 0
        const orderItems: Array<{
            productId: string
            name: string
            nameAr: string
            image: string | null
            quantity: number
            price: number
        }> = []

        for (const item of items) {
            const product = productMap.get(item.productId)
            if (!product) {
                return NextResponse.json(
                    { error: 'Validation error', message: `Product ${item.productId} not found` },
                    { status: 400 }
                )
            }

            const quantity = parseInt(item.quantity) || 1
            if (quantity < 1) {
                return NextResponse.json(
                    { error: 'Validation error', message: 'Quantity must be at least 1' },
                    { status: 400 }
                )
            }

            // Check stock
            if (product.trackStock && product.stock < quantity) {
                return NextResponse.json(
                    { error: 'Stock error', message: `Not enough stock for ${product.name}. Available: ${product.stock}` },
                    { status: 400 }
                )
            }

            const price = country === 'EG' ? product.priceEGP : product.priceSAR
            subtotal += price * quantity

            orderItems.push({
                productId: product.id,
                name: product.name,
                nameAr: product.nameAr,
                image: product.images.length > 0 ? product.images[0] : null,
                quantity,
                price,
            })
        }

        // Get shipping cost
        const shippingRegion = await prisma.shippingRegion.findFirst({
            where: {
                country: address.country,
                city: address.city,
                isActive: true,
            }
        })

        const shippingCost = shippingRegion 
            ? (country === 'EG' ? shippingRegion.shippingCostEGP : shippingRegion.shippingCostSAR)
            : 0

        const total = subtotal + shippingCost

        // Generate order number
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const random = Math.random().toString(36).substring(2, 6).toUpperCase()
        const orderNumber = `ORD-${dateStr}-${random}`

        // Get Stripe key
        const stripeSecretKey = await getStripeSecretKey()
        if (!stripeSecretKey) {
            return NextResponse.json(
                { error: 'Configuration error', message: 'Payment system not configured' },
                { status: 500 }
            )
        }

        // Initialize Stripe
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })

        // Create Stripe PaymentIntent
        const stripeAmount = toStripeAmount(total, country)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: stripeAmount,
            currency: CURRENCY_CONFIG[country].stripeCode,
            metadata: {
                type: 'order',
                customerId: customer.id,
                orderNumber: orderNumber,
            },
            automatic_payment_methods: {
                enabled: true,
            },
        })

        // Build shipping address string
        const shippingAddressParts = [
            address.street,
            address.building ? `Building ${address.building}` : null,
            address.floor ? `Floor ${address.floor}` : null,
            address.apartment ? `Apt ${address.apartment}` : null,
            address.district,
        ].filter(Boolean)
        const shippingAddressStr = shippingAddressParts.join(', ')

        // Create order with items in a transaction
        const order = await prisma.$transaction(async (tx) => {
            // Create order
            const newOrder = await tx.order.create({
                data: {
                    customerId: customer.id,
                    addressId: address.id,
                    orderNumber,
                    status: 'PENDING',
                    currency,
                    subtotal,
                    shippingCost,
                    discount: 0,
                    total,
                    shippingName: address.name,
                    shippingPhone: address.phone,
                    shippingCountry: address.country,
                    shippingCity: address.city,
                    shippingAddress: shippingAddressStr,
                    shippingNotes: shippingNotes || null,
                    items: {
                        create: orderItems,
                    },
                },
                include: {
                    items: true,
                },
            })

            // Reserve stock (decrement)
            for (const item of orderItems) {
                const product = productMap.get(item.productId)
                if (product?.trackStock) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: {
                            stock: { decrement: item.quantity }
                        }
                    })
                }
            }

            // Create payment record
            await tx.payment.create({
                data: {
                    customerId: customer.id,
                    stripePaymentIntentId: paymentIntent.id,
                    amount: total,
                    currency,
                    status: 'PENDING',
                    type: 'ORDER',
                    order: {
                        connect: { id: newOrder.id }
                    },
                    metadata: {
                        orderNumber,
                        itemsCount: orderItems.length,
                    },
                },
            })

            return newOrder
        })

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
                    total: order.total,
                    items: order.items,
                },
                payment: {
                    clientSecret: paymentIntent.client_secret,
                    paymentIntentId: paymentIntent.id,
                    amount: total,
                    currency,
                },
            }
        }, { status: 201 })

    } catch (error) {
        console.error('Error creating order:', error)
        return NextResponse.json(
            { error: 'Internal server error', message: 'Failed to create order' },
            { status: 500 }
        )
    }
}
