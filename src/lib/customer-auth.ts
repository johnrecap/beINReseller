/**
 * Customer Authentication Utilities
 * 
 * JWT-based authentication for the Desh Store mobile app customers.
 * Separate from reseller panel auth (NextAuth) and mobile-auth (for resellers).
 * 
 * Features:
 * - Access & Refresh tokens with separate secrets
 * - OTP generation and verification
 * - withCustomerAuth middleware wrapper
 */

import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// ===== Types =====

export interface CustomerTokenPayload {
    customerId: string
    email: string
    name: string
    country: string
    preferredLang: string
    type: 'access' | 'refresh'
}

export interface TokenPair {
    accessToken: string
    refreshToken: string
    expiresIn: number  // seconds until access token expires
}

export interface AuthResult {
    customer?: CustomerTokenPayload
    error?: string
    status?: number
}

// ===== Configuration =====

const ACCESS_TOKEN_EXPIRY = '15m'   // 15 minutes
const REFRESH_TOKEN_EXPIRY = '30d'  // 30 days
const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 10

// ===== Secret Management =====

function getAccessTokenSecret(): string {
    const secret = process.env.CUSTOMER_JWT_SECRET || process.env.NEXTAUTH_SECRET
    if (!secret) {
        throw new Error('Customer JWT secret not configured. Set CUSTOMER_JWT_SECRET in environment.')
    }
    return secret
}

function getRefreshTokenSecret(): string {
    const secret = process.env.CUSTOMER_REFRESH_SECRET || process.env.CUSTOMER_JWT_SECRET || process.env.NEXTAUTH_SECRET
    if (!secret) {
        throw new Error('Customer refresh secret not configured.')
    }
    // Add suffix to differentiate from access token secret
    return secret + '_refresh'
}

// ===== Token Generation =====

/**
 * Generate access token for customer
 */
export function generateAccessToken(customer: Omit<CustomerTokenPayload, 'type'>): string {
    const secret = getAccessTokenSecret()
    const payload: CustomerTokenPayload = {
        ...customer,
        type: 'access'
    }
    return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

/**
 * Generate refresh token for customer
 */
export function generateRefreshToken(customer: Omit<CustomerTokenPayload, 'type'>): string {
    const secret = getRefreshTokenSecret()
    const payload: CustomerTokenPayload = {
        ...customer,
        type: 'refresh'
    }
    return jwt.sign(payload, secret, { expiresIn: REFRESH_TOKEN_EXPIRY })
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(customer: Omit<CustomerTokenPayload, 'type'>): TokenPair {
    return {
        accessToken: generateAccessToken(customer),
        refreshToken: generateRefreshToken(customer),
        expiresIn: 15 * 60  // 15 minutes in seconds
    }
}

// ===== Token Verification =====

/**
 * Verify access token and return customer data
 */
export function verifyAccessToken(token: string): CustomerTokenPayload | null {
    try {
        const secret = getAccessTokenSecret()
        const decoded = jwt.verify(token, secret) as CustomerTokenPayload & JwtPayload

        if (decoded.type !== 'access') {
            return null
        }

        return {
            customerId: decoded.customerId,
            email: decoded.email,
            name: decoded.name,
            country: decoded.country,
            preferredLang: decoded.preferredLang,
            type: 'access'
        }
    } catch {
        return null
    }
}

/**
 * Verify refresh token and return customer data
 */
export function verifyRefreshToken(token: string): CustomerTokenPayload | null {
    try {
        const secret = getRefreshTokenSecret()
        const decoded = jwt.verify(token, secret) as CustomerTokenPayload & JwtPayload

        if (decoded.type !== 'refresh') {
            return null
        }

        return {
            customerId: decoded.customerId,
            email: decoded.email,
            name: decoded.name,
            country: decoded.country,
            preferredLang: decoded.preferredLang,
            type: 'refresh'
        }
    } catch {
        return null
    }
}

// ===== Request Utilities =====

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) return null

    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null

    return parts[1]
}

/**
 * Get customer from request Authorization header
 */
export function getCustomerFromRequest(request: NextRequest): CustomerTokenPayload | null {
    const token = extractBearerToken(request)
    if (!token) return null

    return verifyAccessToken(token)
}

// ===== OTP Generation =====

/**
 * Generate a random 6-digit OTP
 */
export function generateOTP(): string {
    const digits = '0123456789'
    let otp = ''
    for (let i = 0; i < OTP_LENGTH; i++) {
        otp += digits[crypto.randomInt(0, digits.length)]
    }
    return otp
}

/**
 * Get OTP expiry timestamp (10 minutes from now)
 */
export function getOTPExpiry(): Date {
    const expiry = new Date()
    expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES)
    return expiry
}

/**
 * Check if OTP is expired
 */
export function isOTPExpired(expiry: Date | null): boolean {
    if (!expiry) return true
    return new Date() > expiry
}

// ===== Password Reset =====

/**
 * Generate reset token
 */
export function generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Get reset token expiry (1 hour from now)
 */
export function getResetExpiry(): Date {
    const expiry = new Date()
    expiry.setHours(expiry.getHours() + 1)
    return expiry
}

// ===== Auth Middleware =====

/**
 * Require customer authentication for API routes
 * Returns either customer data or error response
 */
export async function requireCustomerAuth(request: NextRequest): Promise<AuthResult> {
    const customer = getCustomerFromRequest(request)

    if (!customer) {
        return {
            error: 'Unauthorized - please login',
            status: 401
        }
    }

    return { customer }
}

/**
 * Wrapper function for protected customer routes
 * 
 * Usage:
 * ```ts
 * export const GET = withCustomerAuth(async (request, customer) => {
 *     // customer is guaranteed to be authenticated
 *     return NextResponse.json({ customerId: customer.customerId })
 * })
 * ```
 */
export function withCustomerAuth(
    handler: (request: NextRequest, customer: CustomerTokenPayload) => Promise<NextResponse>
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        const result = await requireCustomerAuth(request)

        if (result.error) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: result.status || 401 }
            )
        }

        return handler(request, result.customer!)
    }
}

/**
 * Optional customer auth - doesn't fail if not authenticated
 * Useful for routes that work differently for guests vs customers
 */
export function withOptionalCustomerAuth(
    handler: (request: NextRequest, customer: CustomerTokenPayload | null) => Promise<NextResponse>
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        const customer = getCustomerFromRequest(request)
        return handler(request, customer)
    }
}

// ===== Validation Helpers =====

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

/**
 * Validate password strength
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export function isValidPassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters' }
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must contain an uppercase letter' }
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'Password must contain a lowercase letter' }
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'Password must contain a number' }
    }
    return { valid: true }
}

/**
 * Validate name
 */
export function isValidName(name: string): boolean {
    return name.trim().length >= 2
}
