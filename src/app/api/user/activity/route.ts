/**
 * GET /api/user/activity
 * 
 * Returns the current user's activity summary including:
 * - Last login/operation timestamps
 * - Login count and total operations
 * - Activity status
 * - Recent activity logs
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUserActivitySummary } from '@/lib/services/activityTracker'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }
        
        const summary = await getUserActivitySummary(authUser.id)
        
        return NextResponse.json(summary)
    } catch (error) {
        console.error('Get user activity error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
