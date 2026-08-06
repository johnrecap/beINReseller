/**
 * GET /api/user/activity/history
 * 
 * Returns paginated activity history for the current user.
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { redactActivityLogDetails } from '@/lib/activity-log-redaction'
import { requireAuthAPI } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json(
                { error: authResult.error },
                { status: authResult.status }
            )
        }
        const authUser = authResult.user
        
        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
        
        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where: { userId: authUser.id },
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
            prisma.activityLog.count({ where: { userId: authUser.id } })
        ])
        
        return NextResponse.json({
            logs: logs.map(log => ({
                ...log,
                details: redactActivityLogDetails(log.details),
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })
    } catch (error) {
        console.error('Get activity history error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
