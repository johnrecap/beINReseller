import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { hash } from 'bcryptjs'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        const adminUser = authResult.user

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
                userId: adminUser.id,
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
