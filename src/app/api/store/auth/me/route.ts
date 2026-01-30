/**
 * Store Current Customer (Me)
 * GET /api/store/auth/me
 * 
 * Returns current authenticated customer's profile.
 * Requires Bearer token in Authorization header.
 */

import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest, generateStoreToken } from '@/lib/store-auth'

export async function GET(request: NextRequest) {
    try {
        // Get customer from token
        const tokenCustomer = getStoreCustomerFromRequest(request)
        
        if (!tokenCustomer) {
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
        }
        
        // Get fresh customer data from database
        const customer = await prisma.customer.findUnique({
            where: { id: tokenCustomer.id },
            select: {
                id: true,
                email: true,
                name: true,
                nameAr: true,
                phone: true,
                country: true,
                preferredLang: true,
                isVerified: true,
                createdAt: true,
                lastLoginAt: true,
                addresses: {
                    where: { isDefault: true },
                    take: 1,
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        country: true,
                        city: true,
                        street: true,
                        isDefault: true,
                    }
                },
                _count: {
                    select: {
                        orders: true,
                        subscriptions: true,
                    }
                }
            }
        })
        
        if (!customer) {
            return errorResponse('المستخدم غير موجود', 404, 'NOT_FOUND')
        }
        
        return successResponse({
            customer: {
                ...customer,
                defaultAddress: customer.addresses[0] || null,
                ordersCount: customer._count.orders,
                subscriptionsCount: customer._count.subscriptions,
            }
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}

/**
 * PUT /api/store/auth/me
 * Update customer profile
 */
const updateProfileSchema = z.object({
    name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل').optional(),
    nameAr: z.string().optional(),
    phone: z.string().optional(),
    country: z.enum(['SA', 'EG']).optional(),
    preferredLang: z.enum(['ar', 'en']).optional(),
})

export async function PUT(request: NextRequest) {
    try {
        // Get customer from token
        const tokenCustomer = getStoreCustomerFromRequest(request)
        
        if (!tokenCustomer) {
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
        }
        
        const body = await request.json()
        
        // Validate input
        const result = updateProfileSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const updateData = result.data
        
        // Update customer
        const customer = await prisma.customer.update({
            where: { id: tokenCustomer.id },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                nameAr: true,
                phone: true,
                country: true,
                preferredLang: true,
            }
        })
        
        // Generate new token with updated data
        const token = generateStoreToken({
            id: customer.id,
            email: customer.email,
            name: customer.name,
            country: customer.country,
            preferredLang: customer.preferredLang,
        })
        
        return successResponse({
            token,
            customer,
        }, 'تم تحديث الملف الشخصي بنجاح')
        
    } catch (error) {
        return handleApiError(error)
    }
}

/**
 * PATCH /api/store/auth/me
 * Change password
 */
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    newPassword: z.string().min(8, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'),
})

export async function PATCH(request: NextRequest) {
    try {
        // Get customer from token
        const tokenCustomer = getStoreCustomerFromRequest(request)
        
        if (!tokenCustomer) {
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
        }
        
        const body = await request.json()
        
        // Validate input
        const result = changePasswordSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { currentPassword, newPassword } = result.data
        
        // Get customer with password
        const customer = await prisma.customer.findUnique({
            where: { id: tokenCustomer.id }
        })
        
        if (!customer) {
            return errorResponse('المستخدم غير موجود', 404, 'NOT_FOUND')
        }
        
        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, customer.passwordHash)
        if (!isValidPassword) {
            return errorResponse('كلمة المرور الحالية غير صحيحة', 400, 'INVALID_PASSWORD')
        }
        
        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 12)
        
        // Update password
        await prisma.customer.update({
            where: { id: customer.id },
            data: { passwordHash }
        })
        
        return successResponse(null, 'تم تغيير كلمة المرور بنجاح')
        
    } catch (error) {
        return handleApiError(error)
    }
}
