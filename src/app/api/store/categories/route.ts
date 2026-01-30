/**
 * Store Categories List
 * GET /api/store/categories
 * 
 * Returns all active product categories.
 * Public endpoint - no authentication required.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, handleApiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
    try {
        const categories = await prisma.productCategory.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                name: true,
                nameAr: true,
                description: true,
                descriptionAr: true,
                image: true,
                _count: {
                    select: {
                        products: {
                            where: { isActive: true }
                        }
                    }
                }
            }
        })
        
        // Transform to include product count
        const result = categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            nameAr: cat.nameAr,
            description: cat.description,
            descriptionAr: cat.descriptionAr,
            image: cat.image,
            productCount: cat._count.products,
        }))
        
        return successResponse({ categories: result })
        
    } catch (error) {
        return handleApiError(error)
    }
}
