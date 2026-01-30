/**
 * Admin Products API
 * 
 * GET  - List all products
 * POST - Create new product
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

/**
 * GET /api/admin/store/products
 * List all products with categories
 */
export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const products = await prisma.product.findMany({
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        nameAr: true,
                    }
                },
                _count: {
                    select: {
                        orderItems: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        })

        return NextResponse.json({ success: true, data: products })
    } catch (error) {
        console.error('Error fetching products:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * POST /api/admin/store/products
 * Create a new product
 */
export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json()
        const {
            name,
            nameAr,
            description,
            descriptionAr,
            sku,
            categoryId,
            priceSAR,
            priceEGP,
            comparePriceSAR,
            comparePriceEGP,
            stock,
            isActive,
            isFeatured,
            images,
        } = body

        // Validate required fields
        if (!name || !nameAr || !categoryId || priceSAR === undefined || priceEGP === undefined) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Missing required fields' },
                { status: 400 }
            )
        }

        // Check if category exists
        const category = await prisma.productCategory.findUnique({
            where: { id: categoryId }
        })

        if (!category) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Category not found' },
                { status: 400 }
            )
        }

        // Check SKU uniqueness if provided
        if (sku) {
            const existingSku = await prisma.product.findUnique({
                where: { sku }
            })
            if (existingSku) {
                return NextResponse.json(
                    { error: 'Validation error', message: 'SKU already exists' },
                    { status: 400 }
                )
            }
        }

        const product = await prisma.product.create({
            data: {
                name,
                nameAr,
                description,
                descriptionAr,
                sku: sku || null,
                categoryId,
                priceSAR: parseFloat(priceSAR),
                priceEGP: parseFloat(priceEGP),
                comparePriceSAR: comparePriceSAR ? parseFloat(comparePriceSAR) : null,
                comparePriceEGP: comparePriceEGP ? parseFloat(comparePriceEGP) : null,
                stock: parseInt(stock) || 0,
                isActive: isActive ?? true,
                isFeatured: isFeatured ?? false,
                images: images || [],
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        nameAr: true,
                    }
                }
            }
        })

        return NextResponse.json({ success: true, data: product }, { status: 201 })
    } catch (error) {
        console.error('Error creating product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
