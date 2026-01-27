/**
 * GET /api/admin/users/[userId]/activity
 * 
 * Returns detailed activity information for a specific user.
 * Admin only endpoint.
 * 
 * URL params:
 * - userId: User ID to get activity for
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUserActivitySummary } from '@/lib/services/activityTracker'
import prisma from '@/lib/prisma'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const session = await auth()
        
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }
        
        const { userId } = await params
        
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
