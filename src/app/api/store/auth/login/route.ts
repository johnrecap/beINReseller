/**
 * Store Customer Login
 * POST /api/store/auth/login
 * 
 * Authenticates customer and returns JWT token.
 */

import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { generateStoreToken } from '@/lib/store-auth'

// Validation schema
const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
})

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        
        // Validate input
        const result = loginSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { email, password } = result.data
        
        // Find customer
        const customer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })
        
        if (!customer) {
            return errorResponse('Invalid email or password', 401, 'INVALID_CREDENTIALS')
        }
        
        // Check if account is active
        if (!customer.isActive) {
            return errorResponse('Account disabled. Please contact support.', 403, 'ACCOUNT_DISABLED')
        }
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, customer.passwordHash)
        if (!isValidPassword) {
            return errorResponse('Invalid email or password', 401, 'INVALID_CREDENTIALS')
        }
        
        // Check if email is verified
        if (!customer.isVerified) {
            return errorResponse(
                'Please verify your email first', 
                403, 
                'EMAIL_NOT_VERIFIED'
            )
        }
        
        // Update last login
        await prisma.customer.update({
            where: { id: customer.id },
            data: { lastLoginAt: new Date() }
        })
        
        // Generate JWT token
        const token = generateStoreToken({
            id: customer.id,
            email: customer.email,
            name: customer.name,
            country: customer.country,
            preferredLang: customer.preferredLang,
        })
        
        return successResponse({
            token,
            customer: {
                id: customer.id,
                email: customer.email,
                name: customer.name,
                nameAr: customer.nameAr,
                phone: customer.phone,
                country: customer.country,
                preferredLang: customer.preferredLang,
            }
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
