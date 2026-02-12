/**
 * GET /api/mobile/profile
 * PUT /api/mobile/profile
 * 
 * Get/Update customer profile
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload, isValidName } from '@/lib/customer-auth'

/**
 * GET - Return customer profile
 */
export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.customerId },
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                nameAr: true,
                isVerified: true,
                preferredLang: true,
                country: true,
                walletBalance: true,
                storeCredit: true,
                loginCount: true,
                createdAt: true,
                lastLoginAt: true,
                _count: {
                    select: {
                        addresses: true,
                        orders: true,
                        operations: true
                    }
                }
            }
        })

        if (!customerData) {
            return NextResponse.json(
                { success: false, error: 'Account not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            profile: {
                ...customerData,
                addressCount: customerData._count.addresses,
                orderCount: customerData._count.orders,
                operationCount: customerData._count.operations,
                _count: undefined
            }
        })

    } catch (error) {
        console.error('Get profile error:', error)
        return NextResponse.json(
            { success: false, error: 'Error fetching profile' },
            { status: 500 }
        )
    }
})

/**
 * PUT - Update profile
 */
export const PUT = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { name, nameAr, phone, preferredLang } = body

        // Build update data
        const updateData: Record<string, string> = {}

        if (name !== undefined) {
            if (!isValidName(name)) {
                return NextResponse.json(
                    { success: false, error: 'Name must be at least 2 characters' },
                    { status: 400 }
                )
            }
            updateData.name = name.trim()
        }

        if (nameAr !== undefined) {
            updateData.nameAr = nameAr.trim() || null as any
        }

        if (phone !== undefined) {
            updateData.phone = phone.trim() || null as any
        }

        if (preferredLang !== undefined) {
            if (!['ar', 'en'].includes(preferredLang)) {
                return NextResponse.json(
                    { success: false, error: 'Language not supported' },
                    { status: 400 }
                )
            }
            updateData.preferredLang = preferredLang
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { success: false, error: 'No data to update' },
                { status: 400 }
            )
        }

        const updatedCustomer = await prisma.customer.update({
            where: { id: customer.customerId },
            data: updateData,
            select: {
                id: true,
                name: true,
                nameAr: true,
                phone: true,
                preferredLang: true
            }
        })

        return NextResponse.json({
            success: true,
            message: 'Profile updated',
            profile: updatedCustomer
        })

    } catch (error) {
        console.error('Update profile error:', error)
        return NextResponse.json(
            { success: false, error: 'Error updating profile' },
            { status: 500 }
        )
    }
})
