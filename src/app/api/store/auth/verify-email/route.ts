/**
 * Store Email Verification
 * POST /api/store/auth/verify-email
 * 
 * Verifies customer email using the token sent to their email.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { generateStoreToken } from '@/lib/store-auth'

// Validation schema
const verifySchema = z.object({
    token: z.string().min(1, 'Verification code is required'),
})

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        
        // Validate input
        const result = verifySchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { token } = result.data
        
        // Find customer with this verification token
        const customer = await prisma.customer.findFirst({
            where: {
                verifyToken: token,
                isVerified: false,
            }
        })
        
        if (!customer) {
            return errorResponse('Verification code is invalid or already used', 400, 'INVALID_TOKEN')
        }
        
        // Check if token is expired
        if (customer.verifyExpires && customer.verifyExpires < new Date()) {
            return errorResponse('Verification code expired. Please request a new one.', 400, 'TOKEN_EXPIRED')
        }
        
        // Verify the email
        await prisma.customer.update({
            where: { id: customer.id },
            data: {
                isVerified: true,
                verifyToken: null,
                verifyExpires: null,
                lastLoginAt: new Date(),
            }
        })
        
        // Generate JWT token for immediate login
        const jwtToken = generateStoreToken({
            id: customer.id,
            email: customer.email,
            name: customer.name,
            country: customer.country,
            preferredLang: customer.preferredLang,
        })
        
        return successResponse({
            token: jwtToken,
            customer: {
                id: customer.id,
                email: customer.email,
                name: customer.name,
                nameAr: customer.nameAr,
                country: customer.country,
                preferredLang: customer.preferredLang,
            }
        }, customer.preferredLang === 'ar' 
            ? 'Email verified successfully'
            : 'Email verified successfully')
        
    } catch (error) {
        return handleApiError(error)
    }
}

/**
 * GET /api/store/auth/verify-email?token=xxx
 * Alternative verification via URL click
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const token = searchParams.get('token')
        
        if (!token) {
            return errorResponse('Verification code is required', 400, 'TOKEN_REQUIRED')
        }
        
        // Find customer with this verification token
        const customer = await prisma.customer.findFirst({
            where: {
                verifyToken: token,
                isVerified: false,
            }
        })
        
        if (!customer) {
            return errorResponse('Invalid verification code', 400, 'INVALID_TOKEN')
        }
        
        // Check if token is expired
        if (customer.verifyExpires && customer.verifyExpires < new Date()) {
            return errorResponse('Verification code expired', 400, 'TOKEN_EXPIRED')
        }
        
        // Verify the email
        await prisma.customer.update({
            where: { id: customer.id },
            data: {
                isVerified: true,
                verifyToken: null,
                verifyExpires: null,
            }
        })
        
        return successResponse(null, 'Email verified successfully')
        
    } catch (error) {
        return handleApiError(error)
    }
}
