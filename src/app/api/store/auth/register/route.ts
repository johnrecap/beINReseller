/**
 * Store Customer Registration
 * POST /api/store/auth/register
 * 
 * Creates a new customer account and sends verification email.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { generateVerificationToken, getVerifyTokenExpiry } from '@/lib/store-auth'

// Validation schema
const registerSchema = z.object({
    email: z.string().email('البريد الإلكتروني غير صالح'),
    password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
    name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
    nameAr: z.string().optional(),
    phone: z.string().optional(),
    country: z.enum(['SA', 'EG']).default('SA'),
    preferredLang: z.enum(['ar', 'en']).default('ar'),
})

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        
        // Validate input
        const result = registerSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { email, password, name, nameAr, phone, country, preferredLang } = result.data
        
        // Check if email already exists
        const existingCustomer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })
        
        if (existingCustomer) {
            return errorResponse('البريد الإلكتروني مسجل مسبقاً', 400, 'EMAIL_EXISTS')
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 12)
        
        // Generate verification token
        const verifyToken = generateVerificationToken()
        const verifyExpires = getVerifyTokenExpiry()
        
        // Create customer
        const customer = await prisma.customer.create({
            data: {
                email: email.toLowerCase(),
                passwordHash,
                name,
                nameAr: nameAr || null,
                phone: phone || null,
                country,
                preferredLang,
                verifyToken,
                verifyExpires,
                isVerified: false,
                isActive: true,
            },
            select: {
                id: true,
                email: true,
                name: true,
                country: true,
                preferredLang: true,
                createdAt: true,
            }
        })
        
        // TODO: Send verification email
        // await sendVerificationEmail(customer.email, verifyToken, preferredLang)
        
        // For development, log the verification token
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Store] Verification token for ${email}: ${verifyToken}`)
        }
        
        return successResponse(
            { customer },
            preferredLang === 'ar' 
                ? 'تم إنشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني.'
                : 'Account created successfully. Please check your email to verify.',
            201
        )
        
    } catch (error) {
        return handleApiError(error)
    }
}
