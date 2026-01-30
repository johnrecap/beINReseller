/**
 * Admin Product Detail API
 * 
 * GET    - Get single product
 * PUT    - Update product
 * PATCH  - Partial update (toggle active, etc.)
 * DELETE - Delete product
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * GET /api/admin/store/products/[id]
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                category: true,
                _count: {
                    select: { orderItems: true }
                }
            }
        })

        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true, data: product })
    } catch (error) {
        console.error('Error fetching product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * PUT /api/admin/store/products/[id]
 * Full update
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json()

        // Check if product exists
        const existing = await prisma.product.findUnique({ where: { id } })
        if (!existing) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 })
        }

        // Check SKU uniqueness if changed
        if (body.sku && body.sku !== existing.sku) {
            const existingSku = await prisma.product.findUnique({
                where: { sku: body.sku }
            })
            if (existingSku) {
                return NextResponse.json(
                    { error: 'Validation error', message: 'SKU already exists' },
                    { status: 400 }
                )
            }
        }

        const product = await prisma.product.update({
            where: { id },
            data: {
                name: body.name,
                nameAr: body.nameAr,
                description: body.description,
                descriptionAr: body.descriptionAr,
                sku: body.sku || null,
                categoryId: body.categoryId,
                priceSAR: parseFloat(body.priceSAR),
                priceEGP: parseFloat(body.priceEGP),
                comparePriceSAR: body.comparePriceSAR ? parseFloat(body.comparePriceSAR) : null,
                comparePriceEGP: body.comparePriceEGP ? parseFloat(body.comparePriceEGP) : null,
                stock: parseInt(body.stock) || 0,
                isActive: body.isActive,
                isFeatured: body.isFeatured,
                images: body.images || [],
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

        return NextResponse.json({ success: true, data: product })
    } catch (error) {
        console.error('Error updating product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * PATCH /api/admin/store/products/[id]
 * Partial update (toggle active, featured, update stock, etc.)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json()

        const product = await prisma.product.update({
            where: { id },
            data: body,
        })

        return NextResponse.json({ success: true, data: product })
    } catch (error) {
        console.error('Error patching product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * DELETE /api/admin/store/products/[id]
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        // Check if product has orders
        const orderItems = await prisma.orderItem.count({
            where: { productId: id }
        })

        if (orderItems > 0) {
            // Soft delete - just deactivate
            await prisma.product.update({
                where: { id },
                data: { isActive: false }
            })
            return NextResponse.json({ 
                success: true, 
                message: 'Product deactivated (has order history)'
            })
        }

        // Hard delete if no orders
        await prisma.product.delete({ where: { id } })

        return NextResponse.json({ success: true, message: 'Product deleted' })
    } catch (error) {
        console.error('Error deleting product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
