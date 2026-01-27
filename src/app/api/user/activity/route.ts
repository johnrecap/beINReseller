/**
 * GET /api/user/activity
 * 
 * Returns the current user's activity summary including:
 * - Last login/operation timestamps
 * - Login count and total operations
 * - Activity status
 * - Recent activity logs
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUserActivitySummary } from '@/lib/services/activityTracker'

export async function GET() {
    try {
        const session = await auth()
        
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }
        
        const summary = await getUserActivitySummary(session.user.id)
        
        return NextResponse.json(summary)
    } catch (error) {
        console.error('Get user activity error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
