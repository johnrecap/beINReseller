import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { compare, hash } from 'bcryptjs'

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    newPassword: z.string().min(6, 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'),
})

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const result = changePasswordSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { currentPassword, newPassword } = result.data

        // Get user with password
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'المستخدم غير موجود' },
                { status: 404 }
            )
        }

        // Verify current password
        const isValid = await compare(currentPassword, user.passwordHash)

        if (!isValid) {
            return NextResponse.json(
                { error: 'كلمة المرور الحالية غير صحيحة' },
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
                details: 'تم تغيير كلمة المرور بنجاح',
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        return NextResponse.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح',
        })

    } catch (error) {
        console.error('Change password error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
