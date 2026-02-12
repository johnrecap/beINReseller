import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { markAsRead, markAllAsRead } from '@/lib/notification'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

/**
 * GET /api/notifications - Get user notifications
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '20')
        const page = parseInt(searchParams.get('page') || '1')
        const unreadOnly = searchParams.get('unread') === 'true'

        const where = {
            userId: authUser.id,
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
                where: { userId: authUser.id, read: false }
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
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

/**
 * PUT /api/notifications - Mark notifications as read
 */
export async function PUT(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { notificationId, markAll } = body

        if (markAll) {
            await markAllAsRead(authUser.id)
            return NextResponse.json({ success: true, message: 'All marked as read' })
        }

        if (notificationId) {
            await markAsRead(notificationId, authUser.id)
            return NextResponse.json({ success: true, message: 'Marked as read' })
        }

        return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 })

    } catch (error) {
        console.error('Update notification error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
