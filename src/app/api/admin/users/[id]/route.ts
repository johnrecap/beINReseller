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

        // Prevent deleting self
        if (session.user.id === id) {
            return NextResponse.json({ error: 'لا يمكنك حذف حسابك الشخصي' }, { status: 400 })
        }

        // Check if user exists and not already deleted
        const userToDelete = await prisma.user.findUnique({ where: { id } })
        if (!userToDelete) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        if (userToDelete.deletedAt) {
            return NextResponse.json({ error: 'المستخدم محذوف بالفعل' }, { status: 400 })
        }

        // Prevent deleting last admin
        if (userToDelete.role === 'ADMIN') {
            const adminCount = await prisma.user.count({ where: { role: 'ADMIN', deletedAt: null } })
            if (adminCount <= 1) {
                return NextResponse.json({ error: 'لا يمكن حذف آخر أدمن في النظام' }, { status: 400 })
            }
        }

        // Soft delete - preserve data and mark as deleted
        await prisma.user.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                deletedBalance: userToDelete.balance,
                deletedByUserId: session.user.id,
                isActive: false,
            }
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: session.user.id,
                action: 'ADMIN_DELETE_USER',
                details: `Deleted user: ${userToDelete.username} (balance: ${userToDelete.balance})`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, message: 'تم حذف المستخدم بنجاح' })

    } catch (error) {
        console.error('Delete user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
