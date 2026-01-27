/**
 * GET /api/user/activity/history
 * 
 * Returns paginated activity history for the current user.
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
    try {
        const session = await auth()
        
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }
        
        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
        
        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    action: true,
                    details: true,
                    ipAddress: true,
                    createdAt: true,
                    targetId: true,
                    targetType: true
                }
            }),
            prisma.activityLog.count({ where: { userId: session.user.id } })
        ])
        
        return NextResponse.json({
            logs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })
    } catch (error) {
        console.error('Get activity history error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
