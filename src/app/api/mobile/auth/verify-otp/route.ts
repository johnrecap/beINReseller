/**
 * POST /api/mobile/auth/verify-otp
 * 
 * Verify OTP and activate customer account
 * - Validates OTP
 * - Marks customer as verified
 * - Generates JWT tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
    generateTokenPair,
    isOTPExpired
} from '@/lib/customer-auth'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, otp } = body

        if (!email || !otp) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني ورمز التحقق مطلوبان' },
                { status: 400 }
            )
        }

        // Find customer
        const customer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: 'الحساب غير موجود' },
                { status: 404 }
            )
        }

        if (customer.isVerified) {
            return NextResponse.json(
                { success: false, error: 'الحساب مفعل بالفعل' },
                { status: 400 }
            )
        }

        // Check OTP
        if (customer.verifyToken !== otp) {
            return NextResponse.json(
                { success: false, error: 'رمز التحقق غير صحيح' },
                { status: 400 }
            )
        }

        // Check OTP expiry
        if (isOTPExpired(customer.verifyExpires)) {
            return NextResponse.json(
                { success: false, error: 'رمز التحقق منتهي الصلاحية' },
                { status: 400 }
            )
        }

        // Verify customer
        const updatedCustomer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
                isVerified: true,
                verifyToken: null,
                verifyExpires: null,
                lastLoginAt: new Date(),
                loginCount: { increment: 1 }
            }
        })

        // Generate tokens
        const tokens = generateTokenPair({
            customerId: updatedCustomer.id,
            email: updatedCustomer.email,
            name: updatedCustomer.name,
            country: updatedCustomer.country,
            preferredLang: updatedCustomer.preferredLang
        })

        return NextResponse.json({
            success: true,
            message: 'تم تفعيل الحساب بنجاح',
            customer: {
                id: updatedCustomer.id,
                email: updatedCustomer.email,
                name: updatedCustomer.name,
                country: updatedCustomer.country,
                preferredLang: updatedCustomer.preferredLang,
                walletBalance: updatedCustomer.walletBalance
            },
            tokens
        })

    } catch (error) {
        console.error('Verify OTP error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في التحقق' },
            { status: 500 }
        )
    }
}
