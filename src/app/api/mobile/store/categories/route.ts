/**
 * GET /api/mobile/store/categories
 * 
 * Return active product categories
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
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

        return NextResponse.json({
            success: true,
            categories: categories.map(cat => ({
                ...cat,
                productCount: cat._count.products,
                _count: undefined
            }))
        })

    } catch (error) {
        console.error('Get categories error:', error)
        return NextResponse.json(
            { success: false, error: 'Error fetching categories' },
            { status: 500 }
        )
    }
}
