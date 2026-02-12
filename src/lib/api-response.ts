/**
 * API Response Utilities
 * 
 * Provides consistent error and success response formats across all APIs.
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export interface ApiError {
    error: string
    code?: string
    details?: Record<string, string[]>
}

export interface ApiSuccess<T = unknown> {
    success: true
    data?: T
    message?: string
}

/**
 * Create a successful API response
 */
export function successResponse<T>(data?: T, message?: string, status = 200): NextResponse {
    const body: ApiSuccess<T> = { success: true }
    if (data !== undefined) body.data = data
    if (message) body.message = message
    return NextResponse.json(body, { status })
}

/**
 * Create an error API response
 */
export function errorResponse(error: string, status = 400, code?: string): NextResponse {
    const body: ApiError = { error }
    if (code) body.code = code
    return NextResponse.json(body, { status })
}

/**
 * Handle Zod validation errors
 */
export function validationErrorResponse(error: ZodError): NextResponse {
    const details: Record<string, string[]> = {}

    error.issues.forEach((issue) => {
        const path = issue.path.join('.')
        if (!details[path]) details[path] = []
        details[path].push(issue.message)
    })

    return NextResponse.json(
        {
            error: 'Invalid data',
            code: 'VALIDATION_ERROR',
            details,
        },
        { status: 400 }
    )
}

/**
 * Handle unknown errors
 */
export function handleApiError(error: unknown): NextResponse {
    console.error('API Error:', error)

    if (error instanceof ZodError) {
        return validationErrorResponse(error)
    }

    if (error instanceof Error) {
        // Don't expose internal errors in production
        const message = process.env.NODE_ENV === 'development'
            ? error.message
            : 'Server error occurred'

        return errorResponse(message, 500, 'INTERNAL_ERROR')
    }

    return errorResponse('Unknown error occurred', 500, 'UNKNOWN_ERROR')
}

/**
 * Common error messages
 */
export const ERROR_MESSAGES = {
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Access denied',
    NOT_FOUND: 'Not found',
    VALIDATION: 'Invalid data',
    SERVER_ERROR: 'Server error occurred',
    RATE_LIMITED: 'Rate limit exceeded',
    INSUFFICIENT_BALANCE: 'Insufficient balance',
}
