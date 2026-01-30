/**
 * Store Product Detail
 * GET /api/store/products/[id]
 * 
 * Returns single product details.
 * Public endpoint - no authentication required.
 * 
 * Query params:
 * - country: SA or EG - For price selection
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const { searchParams } = new URL(request.url)
        const country = searchParams.get('country') || 'SA'
        
        const product = await prisma.product.findUnique({
            where: { 
                id,
                isActive: true,
            },
            select: {
                id: true,
                sku: true,
                name: true,
                nameAr: true,
                description: true,
                descriptionAr: true,
                priceSAR: true,
                priceEGP: true,
                comparePriceSAR: true,
                comparePriceEGP: true,
                stock: true,
                trackStock: true,
                images: true,
                specifications: true,
                isFeatured: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        nameAr: true,
                    }
                }
            }
        })
        
        if (!product) {
            return errorResponse('المنتج غير موجود', 404, 'NOT_FOUND')
        }
        
        // Transform product to include appropriate price based on country
        const result = {
            id: product.id,
            sku: product.sku,
            name: product.name,
            nameAr: product.nameAr,
            description: product.description,
            descriptionAr: product.descriptionAr,
            price: country === 'EG' ? product.priceEGP : product.priceSAR,
            comparePrice: country === 'EG' ? product.comparePriceEGP : product.comparePriceSAR,
            currency: country === 'EG' ? 'EGP' : 'SAR',
            inStock: !product.trackStock || product.stock > 0,
            stock: product.trackStock ? product.stock : null,
            images: product.images,
            specifications: product.specifications,
            isFeatured: product.isFeatured,
            category: product.category,
        }
        
        return successResponse({ product: result })
        
    } catch (error) {
        return handleApiError(error)
    }
}
