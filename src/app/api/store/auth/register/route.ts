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
import { generateVerificationToken, getVerifyTokenExpiry, generateStoreToken } from '@/lib/store-auth'

// Validation schema
const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
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
            return errorResponse('Email already registered', 400, 'EMAIL_EXISTS')
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 12)
        
        // Generate verification token
        const verifyToken = generateVerificationToken()
        const verifyExpires = getVerifyTokenExpiry()
        
        // Create customer (auto-verify for now, can require email verification later)
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
                isVerified: true, // Auto-verify for now
                isActive: true,
            },
            select: {
                id: true,
                email: true,
                name: true,
                nameAr: true,
                phone: true,
                country: true,
                preferredLang: true,
                createdAt: true,
            }
        })
        
        // Generate JWT token for immediate login
        const token = generateStoreToken({
            id: customer.id,
            email: customer.email,
            name: customer.name,
            country: customer.country,
            preferredLang: customer.preferredLang,
        })
        
        // TODO: Send verification email
        // await sendVerificationEmail(customer.email, verifyToken, preferredLang)
        
        // For development, log the verification token
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Store] Verification token for ${email}: ${verifyToken}`)
        }
        
        return successResponse(
            { token, customer },
            preferredLang === 'ar' 
                ? 'Account created successfully'
                : 'Account created successfully',
            201
        )
        
    } catch (error) {
        return handleApiError(error)
    }
}
