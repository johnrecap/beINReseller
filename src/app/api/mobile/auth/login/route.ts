/**
 * POST /api/mobile/auth/login
 * 
 * Customer login
 * - Validates credentials
 * - Checks customer is verified
 * - Generates JWT tokens
 * - Updates lastLoginAt, loginCount
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateTokenPair, isValidEmail } from '@/lib/customer-auth'

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
        const { email, password } = body

        if (!email || !password) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
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

        if (!customer) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
                { status: 401 }
            )
        }

        // Check password
        const isValidPass = await bcrypt.compare(password, customer.passwordHash)
        if (!isValidPass) {
            return NextResponse.json(
                { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
                { status: 401 }
            )
        }

        // Check if verified
        if (!customer.isVerified) {
            return NextResponse.json(
                { success: false, error: 'يرجى تفعيل حسابك أولاً', code: 'NOT_VERIFIED' },
                { status: 403 }
            )
        }

        // Check if active
        if (!customer.isActive) {
            return NextResponse.json(
                { success: false, error: 'الحساب معطل', code: 'ACCOUNT_DISABLED' },
                { status: 403 }
            )
        }

        // Update login stats
        const updatedCustomer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
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
            message: 'تم تسجيل الدخول بنجاح',
            customer: {
                id: updatedCustomer.id,
                email: updatedCustomer.email,
                name: updatedCustomer.name,
                country: updatedCustomer.country,
                preferredLang: updatedCustomer.preferredLang,
                walletBalance: updatedCustomer.walletBalance,
                loginCount: updatedCustomer.loginCount
            },
            tokens
        })

    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في تسجيل الدخول' },
            { status: 500 }
        )
    }
}
