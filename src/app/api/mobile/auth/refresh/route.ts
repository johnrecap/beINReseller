/**
 * POST /api/mobile/auth/refresh
 * 
 * Refresh access token using refresh token
 * - Validates refresh token
 * - Generates new access token (refresh token stays the same)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
    verifyRefreshToken,
    generateAccessToken
} from '@/lib/customer-auth'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { refreshToken } = body

        if (!refreshToken) {
            return NextResponse.json(
                { success: false, error: 'Refresh token is required' },
                { status: 400 }
            )
        }

        // Verify refresh token
        const payload = verifyRefreshToken(refreshToken)
        if (!payload) {
            return NextResponse.json(
                { success: false, error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH' },
                { status: 401 }
            )
        }

        // Verify customer still exists and is active
        const customer = await prisma.customer.findUnique({
            where: { id: payload.customerId }
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: 'Account not found' },
                { status: 404 }
            )
        }

        if (!customer.isActive) {
            return NextResponse.json(
                { success: false, error: 'Account disabled' },
                { status: 403 }
            )
        }

        // Generate new access token with fresh customer data
        const accessToken = generateAccessToken({
            customerId: customer.id,
            email: customer.email,
            name: customer.name,
            country: customer.country,
            preferredLang: customer.preferredLang
        })

        return NextResponse.json({
            success: true,
            accessToken,
            expiresIn: 15 * 60  // 15 minutes in seconds
        })

    } catch (error) {
        console.error('Refresh token error:', error)
        return NextResponse.json(
            { success: false, error: 'Error refreshing token' },
            { status: 500 }
        )
    }
}
