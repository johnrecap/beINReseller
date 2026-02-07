/**
 * POST /api/mobile/auth/register
 * 
 * Register a new customer account
 * - Validates email, name, password
 * - Hashes password with bcrypt
 * - Generates 6-digit OTP
 * - Creates customer record
 * - Sends verification email (TODO: implement email service)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import {
    generateOTP,
    getOTPExpiry,
    isValidEmail,
    isValidPassword,
    isValidName
} from '@/lib/customer-auth'

// CORS headers for mobile app
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Handle CORS preflight requests
export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, name, password, country = 'SA', preferredLang = 'ar' } = body

        // ===== Validation =====

        if (!email || !name || !password) {
            return NextResponse.json(
                { success: false, error: 'جميع الحقول مطلوبة' },
                { status: 400, headers: corsHeaders }
            )
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني غير صالح' },
                { status: 400, headers: corsHeaders }
            )
        }

        if (!isValidName(name)) {
            return NextResponse.json(
                { success: false, error: 'الاسم يجب أن يكون على الأقل حرفين' },
                { status: 400, headers: corsHeaders }
            )
        }

        const passwordCheck = isValidPassword(password)
        if (!passwordCheck.valid) {
            return NextResponse.json(
                { success: false, error: passwordCheck.message },
                { status: 400, headers: corsHeaders }
            )
        }

        // ===== Check if email exists =====

        const existingCustomer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })

        if (existingCustomer) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني مستخدم بالفعل' },
                { status: 409, headers: corsHeaders }
            )
        }

        // ===== Create customer =====

        const passwordHash = await bcrypt.hash(password, 12)
        const otp = generateOTP()
        const otpExpiry = getOTPExpiry()

        const customer = await prisma.customer.create({
            data: {
                email: email.toLowerCase(),
                name: name.trim(),
                passwordHash,
                country,
                preferredLang,
                verifyToken: otp,
                verifyExpires: otpExpiry,
                isVerified: false,
                isActive: true
            }
        })

        // ===== Send verification email =====
        // TODO: Implement email service
        // For now, log OTP for development
        console.log(`[Register] OTP for ${email}: ${otp}`)

        return NextResponse.json({
            success: true,
            message: 'تم إنشاء الحساب. يرجى التحقق من بريدك الإلكتروني',
            customerId: customer.id,
            // In development, return OTP for testing
            ...(process.env.NODE_ENV === 'development' && { otp })
        }, { headers: corsHeaders })

    } catch (error) {
        console.error('Register error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في إنشاء الحساب' },
            { status: 500, headers: corsHeaders }
        )
    }
}

