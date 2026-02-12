import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { compare, hash } from 'bcryptjs'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
})

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Only ADMIN can change their own password
        if (authUser.role !== 'ADMIN') {
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
        const hashedPassword = await hash(newPassword, 12)

        // Update password
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: hashedPassword },
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
