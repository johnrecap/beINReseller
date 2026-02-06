/**
 * GET /api/mobile/store/products
 * 
 * Get paginated products
 * - Filter by category
 * - Currency based on customer country
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withOptionalCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

export const GET = withOptionalCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload | null) => {
    try {
        const { searchParams } = new URL(request.url)

        // Pagination params
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        // Filter params
        const categoryId = searchParams.get('categoryId')
        const featured = searchParams.get('featured') === 'true'
        const search = searchParams.get('search')

        // Determine currency (default SAR)
        const currency = customer?.country === 'EG' ? 'EGP' : 'SAR'

        // Build where clause
        const where: Record<string, unknown> = { isActive: true }

        if (categoryId) {
            where.categoryId = categoryId
        }

        if (featured) {
            where.isFeatured = true
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { nameAr: { contains: search, mode: 'insensitive' } }
            ]
        }

        // Get products with pagination
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                orderBy: [
                    { isFeatured: 'desc' },
                    { sortOrder: 'asc' }
                ],
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    nameAr: true,
                    priceSAR: true,
                    priceEGP: true,
                    comparePriceSAR: true,
                    comparePriceEGP: true,
                    images: true,
                    stock: true,
                    trackStock: true,
                    isFeatured: true,
                    category: {
                        select: {
                            id: true,
                            name: true,
                            nameAr: true
                        }
                    }
                }
            }),
            prisma.product.count({ where })
        ])

        const totalPages = Math.ceil(total / limit)

        // Transform products with correct currency
        const transformedProducts = products.map(product => ({
            id: product.id,
            name: product.name,
            nameAr: product.nameAr,
            price: currency === 'EGP' ? product.priceEGP : product.priceSAR,
            comparePrice: currency === 'EGP' ? product.comparePriceEGP : product.comparePriceSAR,
            currency,
            image: product.images[0] || null,
            inStock: !product.trackStock || product.stock > 0,
            isFeatured: product.isFeatured,
            category: product.category
        }))

        return NextResponse.json({
            success: true,
            products: transformedProducts,
            currency,
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
        console.error('Get products error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب المنتجات' },
            { status: 500 }
        )
    }
})
