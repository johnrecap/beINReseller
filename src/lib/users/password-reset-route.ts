import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth-utils'
import { PERMISSION_KEYS } from '@/lib/permissions/catalog'
import { evaluatePermissionForAuthenticatedUser } from '@/lib/permissions/guards'
import { RATE_LIMITS, rateLimitHeaders, withRateLimit } from '@/lib/rate-limiter'
import {
    PasswordResetError,
    resetUserPassword,
} from '@/lib/users/password-reset'

type SupervisorRole = 'ADMIN' | 'MANAGER' | 'AGENT'

const resetPasswordSchema = z.object({
    newPassword: z.string().min(6),
}).strict()

export async function respondToPasswordResetRequest(
    request: NextRequest,
    targetUserId: string,
    expectedRole: SupervisorRole
) {
    try {
        return await processPasswordResetRequest(request, targetUserId, expectedRole)
    } catch {
        console.error('Supervisor password reset request failed', {
            actorRole: expectedRole,
            code: 'PASSWORD_RESET_FAILED',
        })
        return NextResponse.json(
            { error: 'SERVER_ERROR', code: 'SERVER_ERROR' },
            { status: 500 }
        )
    }
}

async function processPasswordResetRequest(
    request: NextRequest,
    targetUserId: string,
    expectedRole: SupervisorRole
) {
    const authResult = await requireAuthAPI(request)
    if ('error' in authResult) {
        return NextResponse.json(
            { error: 'PERMISSION_DENIED', code: 'PERMISSION_DENIED' },
            { status: authResult.status }
        )
    }

    const actor = authResult.user
    if (actor.role !== expectedRole) {
        return NextResponse.json(
            { error: 'PERMISSION_DENIED', code: 'PERMISSION_DENIED' },
            { status: 403 }
        )
    }

    const permission = await evaluatePermissionForAuthenticatedUser(
        actor,
        PERMISSION_KEYS.USERS_RESET_PASSWORD
    )
    if (!permission.allowed) {
        return NextResponse.json(
            { error: 'PERMISSION_DENIED', code: 'PERMISSION_DENIED' },
            { status: 403 }
        )
    }

    const { allowed, result: limitResult } = await withRateLimit(
        'password-reset:' + actor.id + ':' + targetUserId,
        RATE_LIMITS.passwordChange
    )
    if (!allowed) {
        return NextResponse.json(
            { error: 'RATE_LIMITED', code: 'RATE_LIMITED' },
            { status: 429, headers: rateLimitHeaders(limitResult) }
        )
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        body = null
    }
    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'INVALID_PASSWORD', code: 'INVALID_PASSWORD' },
            { status: 400 }
        )
    }

    try {
        const result = await resetUserPassword({
            actorId: actor.id,
            actorRole: expectedRole,
            targetUserId,
            newPassword: parsed.data.newPassword,
            ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                || request.headers.get('x-real-ip'),
            userAgent: request.headers.get('user-agent'),
        })
        return NextResponse.json({ success: true, code: result.code })
    } catch (error) {
        if (error instanceof PasswordResetError) {
            return NextResponse.json(
                { error: error.code, code: error.code },
                { status: error.status }
            )
        }
        console.error('Supervisor password reset failed', {
            actorRole: expectedRole,
            code: 'PASSWORD_RESET_FAILED',
        })
        return NextResponse.json(
            { error: 'SERVER_ERROR', code: 'SERVER_ERROR' },
            { status: 500 }
        )
    }
}
