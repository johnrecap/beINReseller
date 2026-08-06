import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { compare, hash } from 'bcryptjs'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { requireAuthAPI } from '@/lib/auth-utils'
import { SECURITY_CONFIG } from '@/lib/config'

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
})

const PANEL_ROLES = new Set(['ADMIN', 'MANAGER', 'AGENT', 'USER'])

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json(
                { error: authResult.error },
                { status: authResult.status }
            )
        }
        const authUser = authResult.user

        if (typeof authUser.role !== 'string' || !PANEL_ROLES.has(authUser.role)) {
            return NextResponse.json(
                { error: 'You are not allowed to change the password' },
                { status: 403 }
            )
        }

        // Rate limit password change attempts (3 per hour)
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `password-change:${authUser.id}`,
            RATE_LIMITS.passwordChange
        )

        if (!allowed) {
            return NextResponse.json(
                { error: 'Too many attempts, please try again later' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
            )
        }

        const body = await request.json()
        const result = changePasswordSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { currentPassword, newPassword } = result.data

        // Get user with password
        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Verify current password
        const isValid = await compare(currentPassword, user.passwordHash)

        if (!isValid) {
            return NextResponse.json(
                { error: 'Current password is incorrect' },
                { status: 400 }
            )
        }

        // Hash new password
        const hashedPassword = await hash(newPassword, SECURITY_CONFIG.bcryptRounds)

        // Update password
        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: hashedPassword,
                passwordChangedAt: new Date(),
            },
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: user.id,
                action: 'PASSWORD_CHANGED',
                details: 'Password changed successfully',
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        return NextResponse.json({
            success: true,
            message: 'Password changed successfully',
        })

    } catch (error) {
        console.error('Change password error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
