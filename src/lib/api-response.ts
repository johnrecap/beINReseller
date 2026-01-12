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
            error: 'بيانات غير صالحة',
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
            : 'حدث خطأ في الخادم'

        return errorResponse(message, 500, 'INTERNAL_ERROR')
    }

    return errorResponse('حدث خطأ غير معروف', 500, 'UNKNOWN_ERROR')
}

/**
 * Common error messages
 */
export const ERROR_MESSAGES = {
    UNAUTHORIZED: 'غير مصرح',
    FORBIDDEN: 'ليس لديك صلاحية',
    NOT_FOUND: 'غير موجود',
    VALIDATION: 'بيانات غير صالحة',
    SERVER_ERROR: 'حدث خطأ في الخادم',
    RATE_LIMITED: 'تجاوزت الحد المسموح',
    INSUFFICIENT_BALANCE: 'رصيد غير كافي',
}
