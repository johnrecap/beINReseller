/**
 * POST /api/mobile/auth/forgot-password
 * 
 * Request password reset
 * - Generates reset OTP
 * - Sends reset email (TODO: implement email service)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
    generateOTP,
    getOTPExpiry,
    isValidEmail
} from '@/lib/customer-auth'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email } = body

        if (!email) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني مطلوب' },
                { status: 400 }
            )
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني غير صالح' },
                { status: 400 }
            )
        }

        // Find customer
        const customer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })

        // Always return success to prevent email enumeration
        if (!customer) {
            return NextResponse.json({
                success: true,
                message: 'إذا كان البريد موجوداً، سيتم إرسال رمز إعادة التعيين'
            })
        }

        // Generate reset OTP
        const otp = generateOTP()
        const otpExpiry = getOTPExpiry()

        await prisma.customer.update({
            where: { id: customer.id },
            data: {
                resetToken: otp,
                resetExpires: otpExpiry
            }
        })

        // TODO: Send reset email
        console.log(`[ForgotPassword] OTP for ${email}: ${otp}`)

        return NextResponse.json({
            success: true,
            message: 'تم إرسال رمز إعادة التعيين',
            // In development, return OTP for testing
            ...(process.env.NODE_ENV === 'development' && { otp })
        })

    } catch (error) {
        console.error('Forgot password error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في إرسال رمز إعادة التعيين' },
            { status: 500 }
        )
    }
}
