import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

const profileSchema = z.object({
    email: z.string().email('Invalid email address').optional(),
})

/**
 * Helper to get authenticated user from session or mobile token
 */
async function getAuthUser(request: NextRequest) {
    // Try NextAuth session first
    const session = await auth()
    if (session?.user?.id) {
        return session.user
    }
    // Try mobile token
    return getMobileUserFromRequest(request)
}

export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                balance: true,
                createdAt: true,
                _count: { select: { transactions: true } },
                activityLogs: { take: 5, orderBy: { createdAt: 'desc' } }, // Recent activity
            },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Format createdAt
        const userData = {
            ...user,
            transactionsCount: user._count.transactions,
        }

        return NextResponse.json({ user: userData })
    } catch (error) {
        console.error('Get profile error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Only ADMIN can change their own email
        if (authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'You are not allowed to modify the email' },
                { status: 403 }
            )
        }

        const body = await request.json()
        const result = profileSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { email } = result.data

        if (email) {
            // Check if email already taken
            const existing = await prisma.user.findUnique({
                where: { email }
            })

            if (existing && existing.id !== authUser.id) {
                return NextResponse.json(
                    { error: 'Email already in use' },
                    { status: 400 }
                )
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: authUser.id },
            data: {
                email: email || undefined,
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
            }
        })

        return NextResponse.json({
            success: true,
            user: updatedUser,
            message: 'Profile updated successfully'
        })

    } catch (error) {
        console.error('Update profile error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
