/**
 * GET /api/mobile/store/products/[id]
 * 
 * Get single product details
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withOptionalCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

export const GET = withOptionalCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload | null) => {
    try {
        // Extract product ID from URL
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/')
        const productId = pathParts[pathParts.length - 1]

        if (!productId) {
            return NextResponse.json(
                { success: false, error: 'معرف المنتج مطلوب' },
                { status: 400 }
            )
        }

        // Determine currency
        const currency = customer?.country === 'EG' ? 'EGP' : 'SAR'

        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                name: true,
                nameAr: true,
                description: true,
                descriptionAr: true,
                priceSAR: true,
                priceEGP: true,
                comparePriceSAR: true,
                comparePriceEGP: true,
                images: true,
                specifications: true,
                stock: true,
                trackStock: true,
                isFeatured: true,
                isActive: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        nameAr: true
                    }
                }
            }
        })

        if (!product || !product.isActive) {
            return NextResponse.json(
                { success: false, error: 'المنتج غير موجود' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            product: {
                id: product.id,
                name: product.name,
                nameAr: product.nameAr,
                description: product.description,
                descriptionAr: product.descriptionAr,
                price: currency === 'EGP' ? product.priceEGP : product.priceSAR,
                comparePrice: currency === 'EGP' ? product.comparePriceEGP : product.comparePriceSAR,
                currency,
                images: product.images,
                specifications: product.specifications,
                inStock: !product.trackStock || product.stock > 0,
                stock: product.trackStock ? product.stock : null,
                isFeatured: product.isFeatured,
                category: product.category
            }
        })

    } catch (error) {
        console.error('Get product error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب المنتج' },
            { status: 500 }
        )
    }
})
