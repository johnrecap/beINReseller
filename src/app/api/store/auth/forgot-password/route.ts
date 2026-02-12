/**
 * Store Forgot Password
 * POST /api/store/auth/forgot-password
 * 
 * Sends password reset email to customer.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { generateResetToken, getResetTokenExpiry } from '@/lib/store-auth'

// Validation schema
const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
})

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        
        // Validate input
        const result = forgotPasswordSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { email } = result.data
        
        // Find customer (don't reveal if email exists for security)
        const customer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })
        
        // Always return success to prevent email enumeration
        const successMessage = 'If the email is registered, you will receive a password reset message'
        
        if (!customer) {
            return successResponse(null, successMessage)
        }
        
        // Check if account is active
        if (!customer.isActive) {
            return successResponse(null, successMessage)
        }
        
        // Generate reset token
        const resetToken = generateResetToken()
        const resetExpires = getResetTokenExpiry()
        
        // Save reset token
        await prisma.customer.update({
            where: { id: customer.id },
            data: {
                resetToken,
                resetExpires,
            }
        })
        
        // TODO: Send password reset email
        // await sendPasswordResetEmail(customer.email, resetToken, customer.preferredLang)
        
        // For development, log the reset token
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Store] Password reset token for ${email}: ${resetToken}`)
        }
        
        return successResponse(null, successMessage)
        
    } catch (error) {
        return handleApiError(error)
    }
}
