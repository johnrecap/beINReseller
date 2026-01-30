/**
 * Store Products List
 * GET /api/store/products
 * 
 * Returns products with filtering and pagination.
 * Public endpoint - no authentication required.
 * 
 * Query params:
 * - category: Category ID filter
 * - featured: true/false - Only featured products
 * - search: Search term for name
 * - country: SA or EG - For price selection
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, handleApiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        
        // Parse query params
        const category = searchParams.get('category')
        const featured = searchParams.get('featured')
        const search = searchParams.get('search')
        const country = searchParams.get('country') || 'SA'
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
        
        // Build where clause
        const where: Record<string, unknown> = {
            isActive: true,
        }
        
        if (category) {
            where.categoryId = category
        }
        
        if (featured === 'true') {
            where.isFeatured = true
        }
        
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { nameAr: { contains: search, mode: 'insensitive' } },
            ]
        }
        
        // Get total count
        const total = await prisma.product.count({ where })
        
        // Get products
        const products = await prisma.product.findMany({
            where,
            orderBy: [
                { isFeatured: 'desc' },
                { sortOrder: 'asc' },
            ],
            skip: (page - 1) * limit,
            take: limit,
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
        
        // Transform products to include appropriate price based on country
        const result = products.map(product => ({
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
            isFeatured: product.isFeatured,
            category: product.category,
        }))
        
        return successResponse({
            products: result,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
