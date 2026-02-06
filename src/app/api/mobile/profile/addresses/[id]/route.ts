/**
 * GET /api/mobile/profile/addresses/[id]
 * PUT /api/mobile/profile/addresses/[id]
 * DELETE /api/mobile/profile/addresses/[id]
 * 
 * Get/Update/Delete single address
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

interface AddressInput {
    name?: string
    phone?: string
    country?: string
    city?: string
    district?: string
    street?: string
    building?: string
    floor?: string
    apartment?: string
    postalCode?: string
    isDefault?: boolean
}

// Helper to extract address ID from URL
function getAddressId(request: NextRequest): string {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    return pathParts[pathParts.length - 1]
}

/**
 * GET - Get single address
 */
export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const addressId = getAddressId(request)

        const address = await prisma.customerAddress.findUnique({
            where: { id: addressId }
        })

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'العنوان غير موجود' },
                { status: 404 }
            )
        }

        if (address.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'غير مصرح' },
                { status: 403 }
            )
        }

        return NextResponse.json({
            success: true,
            address
        })

    } catch (error) {
        console.error('Get address error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب العنوان' },
            { status: 500 }
        )
    }
})

/**
 * PUT - Update address
 */
export const PUT = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const addressId = getAddressId(request)
        const body = await request.json() as AddressInput

        // Check address exists and belongs to customer
        const existingAddress = await prisma.customerAddress.findUnique({
            where: { id: addressId }
        })

        if (!existingAddress) {
            return NextResponse.json(
                { success: false, error: 'العنوان غير موجود' },
                { status: 404 }
            )
        }

        if (existingAddress.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'غير مصرح' },
                { status: 403 }
            )
        }

        // If setting as default, unset other defaults
        if (body.isDefault && !existingAddress.isDefault) {
            await prisma.customerAddress.updateMany({
                where: {
                    customerId: customer.customerId,
                    id: { not: addressId }
                },
                data: { isDefault: false }
            })
        }

        // Build update data
        const updateData: Record<string, string | boolean | null> = {}

        if (body.name !== undefined) updateData.name = body.name.trim()
        if (body.phone !== undefined) updateData.phone = body.phone.trim()
        if (body.country !== undefined) updateData.country = body.country
        if (body.city !== undefined) updateData.city = body.city.trim()
        if (body.district !== undefined) updateData.district = body.district?.trim() || null
        if (body.street !== undefined) updateData.street = body.street.trim()
        if (body.building !== undefined) updateData.building = body.building?.trim() || null
        if (body.floor !== undefined) updateData.floor = body.floor?.trim() || null
        if (body.apartment !== undefined) updateData.apartment = body.apartment?.trim() || null
        if (body.postalCode !== undefined) updateData.postalCode = body.postalCode?.trim() || null
        if (body.isDefault !== undefined) updateData.isDefault = body.isDefault

        const address = await prisma.customerAddress.update({
            where: { id: addressId },
            data: updateData
        })

        return NextResponse.json({
            success: true,
            message: 'تم تحديث العنوان',
            address
        })

    } catch (error) {
        console.error('Update address error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في تحديث العنوان' },
            { status: 500 }
        )
    }
})

/**
 * DELETE - Delete address
 */
export const DELETE = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const addressId = getAddressId(request)

        // Check address exists and belongs to customer
        const address = await prisma.customerAddress.findUnique({
            where: { id: addressId }
        })

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'العنوان غير موجود' },
                { status: 404 }
            )
        }

        if (address.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'غير مصرح' },
                { status: 403 }
            )
        }

        // Check if address has orders
        const orderCount = await prisma.order.count({
            where: { addressId }
        })

        if (orderCount > 0) {
            return NextResponse.json(
                { success: false, error: 'لا يمكن حذف عنوان مرتبط بطلبات' },
                { status: 400 }
            )
        }

        await prisma.customerAddress.delete({
            where: { id: addressId }
        })

        // If was default, make another address default
        if (address.isDefault) {
            const nextAddress = await prisma.customerAddress.findFirst({
                where: { customerId: customer.customerId },
                orderBy: { createdAt: 'desc' }
            })
            if (nextAddress) {
                await prisma.customerAddress.update({
                    where: { id: nextAddress.id },
                    data: { isDefault: true }
                })
            }
        }

        return NextResponse.json({
            success: true,
            message: 'تم حذف العنوان'
        })

    } catch (error) {
        console.error('Delete address error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في حذف العنوان' },
            { status: 500 }
        )
    }
})
