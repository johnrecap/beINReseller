/**
 * Store Authentication Utilities
 * 
 * JWT-based authentication for the Desh Store mobile app.
 * Separate from the reseller panel auth (NextAuth).
 */

import jwt, { SignOptions } from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * Store customer type for JWT tokens
 */
export interface StoreCustomer {
    id: string
    email: string
    name: string
    country: string
    preferredLang: string
}

/**
 * JWT payload structure for store tokens
 */
interface StoreTokenPayload extends StoreCustomer {
    iat: number
    exp: number
}

/**
 * Get JWT secret from environment
 */
function getJwtSecret(): string {
    const secret = process.env.STORE_JWT_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
    if (!secret) {
        throw new Error('JWT secret not configured. Set STORE_JWT_SECRET in environment.')
    }
    return secret
}

/**
 * Generate a JWT token for store customer
 * @param customer - Customer data to encode in token
 * @param expiresIn - Token expiry (default: 30 days for mobile app)
 */
export function generateStoreToken(customer: StoreCustomer, expiresIn: SignOptions['expiresIn'] = '30d'): string {
    const secret = getJwtSecret()
    
    const payload: Omit<StoreTokenPayload, 'iat' | 'exp'> = {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        country: customer.country,
        preferredLang: customer.preferredLang,
    }
    
    return jwt.sign(payload, secret, { expiresIn })
}

/**
 * Verify a store JWT token and return customer data
 * @param token - JWT token to verify
 * @returns Customer data if valid, null if invalid/expired
 */
export function verifyStoreToken(token: string): StoreCustomer | null {
    try {
        const secret = getJwtSecret()
        const decoded = jwt.verify(token, secret) as StoreTokenPayload
        
        return {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            country: decoded.country,
            preferredLang: decoded.preferredLang,
        }
    } catch {
        // Token is invalid or expired
        return null
    }
}

/**
 * Extract Bearer token from Authorization header
 * @param request - Next.js request object
 * @returns Token string or null
 */
export function extractBearerToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) return null
    
    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null
    
    return parts[1]
}

/**
 * Get store customer from request Authorization header
 * @param request - Next.js request object
 * @returns Customer data if valid token, null otherwise
 */
export function getStoreCustomerFromRequest(request: NextRequest): StoreCustomer | null {
    const token = extractBearerToken(request)
    if (!token) return null
    
    return verifyStoreToken(token)
}

/**
 * Generate a random verification token
 * @returns 32-character hex string
 */
export function generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Generate a random password reset token
 * @returns 32-character hex string
 */
export function generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Get verification token expiry (24 hours from now)
 */
export function getVerifyTokenExpiry(): Date {
    const expiry = new Date()
    expiry.setHours(expiry.getHours() + 24)
    return expiry
}

/**
 * Get reset token expiry (1 hour from now)
 */
export function getResetTokenExpiry(): Date {
    const expiry = new Date()
    expiry.setHours(expiry.getHours() + 1)
    return expiry
}
