import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const updateUserSchema = z.object({
    email: z.string().email('البريد الإلكتروني غير صالح').optional(),
    isActive: z.boolean().optional(),
})

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Fix for Next.js 15+
) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                balance: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
                _count: { select: { transactions: true, operations: true } },
            }
        })

        if (!user) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        return NextResponse.json({ user })

    } catch (error) {
        console.error('Get user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const body = await request.json()
        const result = updateUserSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: result.data
        })

        return NextResponse.json({ success: true, user: updatedUser })

    } catch (error) {
        console.error('Update user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        // Soft delete by deactivating
        const user = await prisma.user.update({
            where: { id },
            data: { isActive: false }
        })

        return NextResponse.json({ success: true, message: 'تم تعطيل المستخدم بنجاح' })

    } catch (error) {
        console.error('Delete user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
