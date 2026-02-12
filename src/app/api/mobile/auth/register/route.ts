/**
 * POST /api/mobile/auth/register
 * 
 * Register a new customer account
 * - Validates email, name, password
 * - Hashes password with bcrypt
 * - Creates customer record (auto-verified)
 * - Returns JWT tokens for immediate login
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import {
    generateTokenPair,
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
                { success: false, error: 'All fields are required' },
                { status: 400, headers: corsHeaders }
            )
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { success: false, error: 'Invalid email' },
                { status: 400, headers: corsHeaders }
            )
        }

        if (!isValidName(name)) {
            return NextResponse.json(
                { success: false, error: 'Name must be at least 2 characters' },
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
                { success: false, error: 'Email is already in use' },
                { status: 409, headers: corsHeaders }
            )
        }

        // ===== Create customer (auto-verified) =====

        const passwordHash = await bcrypt.hash(password, 12)

        const customer = await prisma.customer.create({
            data: {
                email: email.toLowerCase(),
                name: name.trim(),
                passwordHash,
                country,
                preferredLang,
                isVerified: true,  // Auto-verified
                isActive: true
            }
        })

        // ===== Generate tokens for immediate login =====
        const tokens = generateTokenPair({
            customerId: customer.id,
            email: customer.email,
            name: customer.name,
            country: customer.country,
            preferredLang: customer.preferredLang
        })

        return NextResponse.json({
            success: true,
            message: 'Account created successfully',
            customer: {
                id: customer.id,
                email: customer.email,
                name: customer.name,
                country: customer.country,
                preferredLang: customer.preferredLang,
                storeCredit: customer.storeCredit
            },
            tokens
        }, { headers: corsHeaders })

    } catch (error) {
        console.error('Register error:', error)
        return NextResponse.json(
            { success: false, error: 'Error creating account' },
            { status: 500, headers: corsHeaders }
        )
    }
}


