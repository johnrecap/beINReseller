/**
 * GET /api/admin/users/[id]/activity
 * 
 * Returns detailed activity information for a specific user.
 * Admin only endpoint.
 * 
 * URL params:
 * - id: User ID to get activity for
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { getUserActivitySummary } from '@/lib/services/activityTracker'
import prisma from '@/lib/prisma'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        
        const { id: userId } = await params
        
        // Verify user exists and get basic info
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                balance: true,
                isActive: true,
                createdAt: true
            }
        })
        
        if (!user) {
            return NextResponse.json(
                { error: 'المستخدم غير موجود' },
                { status: 404 }
            )
        }
        
        const activity = await getUserActivitySummary(userId)
        
        return NextResponse.json({
            user,
            activity
        })
    } catch (error) {
        console.error('Get user activity error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
