/**
 * Admin Shipping API
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

        const regions = await prisma.shippingRegion.findMany({
            orderBy: [{ country: 'asc' }, { city: 'asc' }]
        })

        return NextResponse.json({ success: true, data: regions })
    } catch (error) {
        console.error('Error fetching shipping regions:', error)
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

        // Check for duplicate
        const existing = await prisma.shippingRegion.findFirst({
            where: { country: body.country, city: body.city }
        })

        if (existing) {
            return NextResponse.json(
                { error: 'Shipping region already exists for this city' },
                { status: 400 }
            )
        }

        const region = await prisma.shippingRegion.create({
            data: {
                country: body.country,
                countryName: body.countryName,
                countryNameAr: body.countryNameAr,
                city: body.city,
                cityAr: body.cityAr,
                shippingCostSAR: body.shippingCostSAR,
                shippingCostEGP: body.shippingCostEGP,
                estimatedDays: body.estimatedDays || 3,
                isActive: body.isActive ?? true,
            }
        })

        return NextResponse.json({ success: true, data: region }, { status: 201 })
    } catch (error) {
        console.error('Error creating shipping region:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
