import jwt, { SignOptions } from 'jsonwebtoken'
import { NextRequest } from 'next/server'

/**
 * Mobile user type - matches the structure returned by NextAuth session
 */
export interface MobileUser {
    id: string
    username: string
    email?: string | null
    role: string
    balance: number
}

/**
 * JWT payload structure for mobile tokens
 */
interface MobileTokenPayload {
    id: string
    username: string
    email?: string | null
    role: string
    balance: number
    iat: number
    exp: number
}

/**
 * Get JWT secret from environment
 * Uses the same secret as NextAuth for consistency
 */
function getJwtSecret(): string {
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
    if (!secret) {
        throw new Error('JWT secret not configured. Set NEXTAUTH_SECRET or AUTH_SECRET in environment.')
    }
    return secret
}

/**
 * Generate a JWT token for mobile authentication
 * @param user - User data to encode in token
 * @param expiresIn - Token expiry (default: 7 days)
 */
export function generateMobileToken(user: MobileUser, expiresIn: SignOptions['expiresIn'] = '7d'): string {
    const secret = getJwtSecret()
    
    const payload = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
    }
    
    return jwt.sign(payload, secret, { expiresIn })
}

/**
 * Verify a mobile JWT token and return user data
 * @param token - JWT token to verify
 * @returns User data if valid, null if invalid/expired
 */
export function verifyMobileToken(token: string): MobileUser | null {
    try {
        const secret = getJwtSecret()
        const decoded = jwt.verify(token, secret) as MobileTokenPayload
        
        return {
            id: decoded.id,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role,
            balance: decoded.balance,
        }
    } catch (error) {
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
 * Get mobile user from request Authorization header
 * @param request - Next.js request object
 * @returns User data if valid token, null otherwise
 */
export function getMobileUserFromRequest(request: NextRequest): MobileUser | null {
    const token = extractBearerToken(request)
    if (!token) return null
    
    return verifyMobileToken(token)
}
