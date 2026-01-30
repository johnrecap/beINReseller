/**
 * Admin Categories API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const categories = await prisma.productCategory.findMany({
            include: {
                _count: { select: { products: true } }
            },
            orderBy: { sortOrder: 'asc' }
        })

        return NextResponse.json({ success: true, data: categories })
    } catch (error) {
        console.error('Error fetching categories:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json()

        const category = await prisma.productCategory.create({
            data: {
                name: body.name,
                nameAr: body.nameAr,
                description: body.description || null,
                descriptionAr: body.descriptionAr || null,
                image: body.image || null,
                isActive: body.isActive ?? true,
                sortOrder: body.sortOrder ?? 0,
            }
        })

        return NextResponse.json({ success: true, data: category }, { status: 201 })
    } catch (error) {
        console.error('Error creating category:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
