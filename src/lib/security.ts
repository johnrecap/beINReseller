/**
 * Security Headers Middleware
 * 
 * Adds security headers to all responses.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function securityHeaders(response: NextResponse): NextResponse {
    // Prevent XSS attacks
    response.headers.set('X-XSS-Protection', '1; mode=block')

    // Prevent MIME type sniffing
    response.headers.set('X-Content-Type-Options', 'nosniff')

    // Prevent clickjacking
    response.headers.set('X-Frame-Options', 'DENY')

    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Permissions policy
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()'
    )

    return response
}

/**
 * Simple in-memory rate limiter (for development)
 * In production, use Redis-based rate limiting
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

export interface RateLimitConfig {
    maxRequests: number
    windowMs: number
}

export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 }
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const key = identifier

    let record = rateLimitStore.get(key)

    // Clean up or initialize
    if (!record || now > record.resetAt) {
        record = {
            count: 0,
            resetAt: now + config.windowMs,
        }
    }

    record.count++
    rateLimitStore.set(key, record)

    const remaining = Math.max(0, config.maxRequests - record.count)
    const allowed = record.count <= config.maxRequests

    return { allowed, remaining, resetAt: record.resetAt }
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
        return forwarded.split(',')[0].trim()
    }
    return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: URLs
        .replace(/on\w+=/gi, '') // Remove event handlers
        .trim()
}

/**
 * Validate and sanitize SQL-like input
 */
export function sanitizeSqlInput(input: string): string {
    return input
        .replace(/['";\\]/g, '') // Remove SQL special characters
        .replace(/--/g, '') // Remove SQL comments
        .trim()
}
