import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hash } from 'bcryptjs'

export async function POST(
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
        const { newPassword } = body
        const passwordToSet = newPassword || Math.random().toString(36).slice(-8)

        // Hash user password
        const hashedPassword = await hash(passwordToSet, 12)

        await prisma.user.update({
            where: { id },
            data: { passwordHash: hashedPassword }
        })

        // Log
        await prisma.activityLog.create({
            data: {
                userId: session.user.id,
                action: 'ADMIN_RESET_PASSWORD',
                details: `Reset password for user ${id}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({
            success: true,
            message: 'تم إعادة تعيين كلمة المرور بنجاح',
            newPassword: passwordToSet
        })

    } catch (error) {
        console.error('Reset password error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
