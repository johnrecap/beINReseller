/**
 * Admin Shipping Region Detail API
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

        const region = await prisma.shippingRegion.update({
            where: { id },
            data: {
                city: body.city,
                cityAr: body.cityAr,
                shippingCostSAR: body.shippingCostSAR,
                shippingCostEGP: body.shippingCostEGP,
                estimatedDays: body.estimatedDays,
                isActive: body.isActive,
            }
        })

        return NextResponse.json({ success: true, data: region })
    } catch (error) {
        console.error('Error updating shipping region:', error)
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

        await prisma.shippingRegion.delete({ where: { id } })

        return NextResponse.json({ success: true, message: 'Region deleted' })
    } catch (error) {
        console.error('Error deleting shipping region:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
