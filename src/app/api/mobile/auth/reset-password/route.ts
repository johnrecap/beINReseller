/**
 * POST /api/mobile/auth/reset-password
 * 
 * Reset password using OTP
 * - Validates reset OTP
 * - Updates password
 * - Clears reset token
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import {
    isValidEmail,
    isValidPassword,
    isOTPExpired
} from '@/lib/customer-auth'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, otp, newPassword } = body

        if (!email || !otp || !newPassword) {
            return NextResponse.json(
                { success: false, error: 'All fields are required' },
                { status: 400 }
            )
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { success: false, error: 'Invalid email' },
                { status: 400 }
            )
        }

        const passwordCheck = isValidPassword(newPassword)
        if (!passwordCheck.valid) {
            return NextResponse.json(
                { success: false, error: passwordCheck.message },
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

        // Check reset token
        if (!customer.resetToken || customer.resetToken !== otp) {
            return NextResponse.json(
                { success: false, error: 'Invalid reset code' },
                { status: 400 }
            )
        }

        // Check OTP expiry
        if (isOTPExpired(customer.resetExpires)) {
            return NextResponse.json(
                { success: false, error: 'Reset code expired' },
                { status: 400 }
            )
        }

        // Update password
        const passwordHash = await bcrypt.hash(newPassword, 12)

        await prisma.customer.update({
            where: { id: customer.id },
            data: {
                passwordHash,
                resetToken: null,
                resetExpires: null
            }
        })

        return NextResponse.json({
            success: true,
            message: 'Password changed successfully'
        })

    } catch (error) {
        console.error('Reset password error:', error)
        return NextResponse.json(
            { success: false, error: 'Error changing password' },
            { status: 500 }
        )
    }
}
