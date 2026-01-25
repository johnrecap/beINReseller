import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPI } from '@/lib/auth-utils'
import { hash } from 'bcryptjs'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authResult = await requireRoleAPI('MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: manager } = authResult

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `manager:${manager.id}`,
            RATE_LIMITS.manager
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'تجاوزت الحد المسموح، انتظر قليلاً' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        // Check if user exists
        const targetUser = await prisma.user.findUnique({ where: { id } })
        if (!targetUser) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        if (targetUser.deletedAt) {
            return NextResponse.json({ error: 'لا يمكن تعديل كلمة مرور مستخدم محذوف' }, { status: 400 })
        }

        // Check if this user belongs to this manager
        const managerUserLink = await prisma.managerUser.findFirst({
            where: {
                managerId: manager.id,
                userId: id
            }
        })

        if (!managerUserLink) {
            return NextResponse.json({ error: 'ليس لديك صلاحية تعديل كلمة مرور هذا المستخدم' }, { status: 403 })
        }

        const body = await request.json()
        const { newPassword } = body
        
        // Generate random password if not provided
        const passwordToSet = newPassword || Math.random().toString(36).slice(-8)

        // Hash the password
        const hashedPassword = await hash(passwordToSet, 12)

        // Update user password
        await prisma.user.update({
            where: { id },
            data: { passwordHash: hashedPassword }
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: manager.id,
                action: 'MANAGER_RESET_PASSWORD',
                details: {
                    targetUsername: targetUser.username,
                    targetUserId: id
                },
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({
            success: true,
            message: 'تم إعادة تعيين كلمة المرور بنجاح',
            newPassword: passwordToSet
        })

    } catch (error) {
        console.error('Manager reset password error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
