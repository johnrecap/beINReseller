import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { markAsRead, markAllAsRead } from '@/lib/notification'

/**
 * GET /api/notifications - Get user notifications
 */
export async function GET(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '20')
        const page = parseInt(searchParams.get('page') || '1')
        const unreadOnly = searchParams.get('unread') === 'true'

        const where = {
            userId: session.user.id,
            ...(unreadOnly && { read: false }),
        }

        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: (page - 1) * limit,
            }),
            prisma.notification.count({ where }),
            prisma.notification.count({
                where: { userId: session.user.id, read: false }
            }),
        ])

        return NextResponse.json({
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
            unreadCount,
        })

    } catch (error) {
        console.error('Get notifications error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

/**
 * PUT /api/notifications - Mark notifications as read
 */
export async function PUT(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const body = await request.json()
        const { notificationId, markAll } = body

        if (markAll) {
            await markAllAsRead(session.user.id)
            return NextResponse.json({ success: true, message: 'تم تحديد الكل كمقروء' })
        }

        if (notificationId) {
            await markAsRead(notificationId, session.user.id)
            return NextResponse.json({ success: true, message: 'تم التحديد كمقروء' })
        }

        return NextResponse.json({ error: 'معرف الإشعار مطلوب' }, { status: 400 })

    } catch (error) {
        console.error('Update notification error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
