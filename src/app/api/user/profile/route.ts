import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

const profileSchema = z.object({
    email: z.string().email('البريد الإلكتروني غير صالح').optional(),
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
                { error: 'غير مصرح' },
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
                { error: 'المستخدم غير موجود' },
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
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        // Only ADMIN can change their own email
        if (authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'غير مصرح لك بتعديل الإيميل' },
                { status: 403 }
            )
        }

        const body = await request.json()
        const result = profileSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: result.error.flatten() },
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
                    { error: 'البريد الإلكتروني مستخدم بالفعل' },
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
            message: 'تم تحديث الملف الشخصي بنجاح'
        })

    } catch (error) {
        console.error('Update profile error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
