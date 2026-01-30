/**
 * Admin Category Detail API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json()

        const category = await prisma.productCategory.update({
            where: { id },
            data: {
                name: body.name,
                nameAr: body.nameAr,
                description: body.description || null,
                descriptionAr: body.descriptionAr || null,
                image: body.image || null,
                isActive: body.isActive,
                sortOrder: body.sortOrder,
            }
        })

        return NextResponse.json({ success: true, data: category })
    } catch (error) {
        console.error('Error updating category:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        // Check if category has products
        const products = await prisma.product.count({ where: { categoryId: id } })
        if (products > 0) {
            return NextResponse.json(
                { error: 'Cannot delete category with products' },
                { status: 400 }
            )
        }

        await prisma.productCategory.delete({ where: { id } })

        return NextResponse.json({ success: true, message: 'Category deleted' })
    } catch (error) {
        console.error('Error deleting category:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
