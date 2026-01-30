/**
 * Store Reset Password
 * POST /api/store/auth/reset-password
 * 
 * Resets customer password using the token sent to their email.
 */

import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'

// Validation schema
const resetPasswordSchema = z.object({
    token: z.string().min(1, 'رمز إعادة التعيين مطلوب'),
    password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
})

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        
        // Validate input
        const result = resetPasswordSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { token, password } = result.data
        
        // Find customer with this reset token
        const customer = await prisma.customer.findFirst({
            where: {
                resetToken: token,
            }
        })
        
        if (!customer) {
            return errorResponse('رمز إعادة التعيين غير صالح', 400, 'INVALID_TOKEN')
        }
        
        // Check if token is expired
        if (customer.resetExpires && customer.resetExpires < new Date()) {
            return errorResponse('انتهت صلاحية رمز إعادة التعيين. يرجى طلب رمز جديد.', 400, 'TOKEN_EXPIRED')
        }
        
        // Hash new password
        const passwordHash = await bcrypt.hash(password, 12)
        
        // Update password and clear reset token
        await prisma.customer.update({
            where: { id: customer.id },
            data: {
                passwordHash,
                resetToken: null,
                resetExpires: null,
            }
        })
        
        return successResponse(
            null, 
            customer.preferredLang === 'ar'
                ? 'تم تغيير كلمة المرور بنجاح'
                : 'Password changed successfully'
        )
        
    } catch (error) {
        return handleApiError(error)
    }
}
