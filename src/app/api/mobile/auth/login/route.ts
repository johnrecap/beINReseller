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
                { success: false, error: 'Email and password are required' },
                { status: 400, headers: corsHeaders }
            )
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { success: false, error: 'Invalid email' },
                { status: 400, headers: corsHeaders }
            )
        }

        // Find customer
        const customer = await prisma.customer.findUnique({
            where: { email: email.toLowerCase() }
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: 'Invalid email or password' },
                { status: 401, headers: corsHeaders }
            )
        }

        // Check password
        const isValidPass = await bcrypt.compare(password, customer.passwordHash)
        if (!isValidPass) {
            return NextResponse.json(
                { success: false, error: 'Invalid email or password' },
                { status: 401, headers: corsHeaders }
            )
        }

        // Check if verified
        if (!customer.isVerified) {
            return NextResponse.json(
                { success: false, error: 'Please verify your account first', code: 'NOT_VERIFIED' },
                { status: 403, headers: corsHeaders }
            )
        }

        // Check if active
        if (!customer.isActive) {
            return NextResponse.json(
                { success: false, error: 'Account disabled', code: 'ACCOUNT_DISABLED' },
                { status: 403, headers: corsHeaders }
            )
        }

        // Update login stats
        const updatedCustomer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
                lastLoginAt: new Date(),
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
            message: 'Login successful',
            customer: {
                id: updatedCustomer.id,
                email: updatedCustomer.email,
                name: updatedCustomer.name,
                country: updatedCustomer.country,
                preferredLang: updatedCustomer.preferredLang,
                storeCredit: updatedCustomer.storeCredit
            },
            tokens
        }, { headers: corsHeaders })

    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json(
            { success: false, error: 'Login error' },
            { status: 500, headers: corsHeaders }
        )
    }
}

