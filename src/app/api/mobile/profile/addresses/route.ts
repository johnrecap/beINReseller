/**
 * GET /api/mobile/profile/addresses
 * POST /api/mobile/profile/addresses
 * 
 * List/Create customer addresses
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

interface AddressInput {
    name: string
    phone: string
    country: string
    city: string
    district?: string
    street: string
    building?: string
    floor?: string
    apartment?: string
    postalCode?: string
    isDefault?: boolean
}

/**
 * GET - List customer addresses
 */
export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const addresses = await prisma.customerAddress.findMany({
            where: { customerId: customer.customerId },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' }
            ],
            select: {
                id: true,
                name: true,
                phone: true,
                country: true,
                city: true,
                district: true,
                street: true,
                building: true,
                floor: true,
                apartment: true,
                postalCode: true,
                isDefault: true
            }
        })

        return NextResponse.json({
            success: true,
            addresses
        })

    } catch (error) {
        console.error('Get addresses error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب العناوين' },
            { status: 500 }
        )
    }
})

/**
 * POST - Add new address
 */
export const POST = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json() as AddressInput

        // Validate required fields
        if (!body.name || !body.phone || !body.city || !body.street) {
            return NextResponse.json(
                { success: false, error: 'الاسم، رقم الهاتف، المدينة، والشارع مطلوبة' },
                { status: 400 }
            )
        }

        // If this is set as default, unset other defaults
        if (body.isDefault) {
            await prisma.customerAddress.updateMany({
                where: { customerId: customer.customerId },
                data: { isDefault: false }
            })
        }

        // Check if first address (make it default)
        const addressCount = await prisma.customerAddress.count({
            where: { customerId: customer.customerId }
        })
        const isFirstAddress = addressCount === 0

        const address = await prisma.customerAddress.create({
            data: {
                customerId: customer.customerId,
                name: body.name.trim(),
                phone: body.phone.trim(),
                country: body.country || customer.country,
                city: body.city.trim(),
                district: body.district?.trim() || null,
                street: body.street.trim(),
                building: body.building?.trim() || null,
                floor: body.floor?.trim() || null,
                apartment: body.apartment?.trim() || null,
                postalCode: body.postalCode?.trim() || null,
                isDefault: body.isDefault || isFirstAddress
            }
        })

        return NextResponse.json({
            success: true,
            message: 'تم إضافة العنوان',
            address
        })

    } catch (error) {
        console.error('Add address error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في إضافة العنوان' },
            { status: 500 }
        )
    }
})
