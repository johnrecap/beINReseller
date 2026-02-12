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
                { success: false, error: 'Email and verification code are required' },
                { status: 400 }
            )
        }

        // Find customer
        const customer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: 'Account not found' },
                { status: 404 }
            )
        }

        if (customer.isVerified) {
            return NextResponse.json(
                { success: false, error: 'Account is already verified' },
                { status: 400 }
            )
        }

        // Check OTP
        if (customer.verifyToken !== otp) {
            return NextResponse.json(
                { success: false, error: 'Invalid verification code' },
                { status: 400 }
            )
        }

        // Check OTP expiry
        if (isOTPExpired(customer.verifyExpires)) {
            return NextResponse.json(
                { success: false, error: 'Verification code expired' },
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
            message: 'Account verified successfully',
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
            { success: false, error: 'Verification error' },
            { status: 500 }
        )
    }
}
