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
import { getUserActivitySummary } from '@/lib/services/activityTracker'
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
        
        const summary = await getUserActivitySummary(authUser.id)
        
        return NextResponse.json(summary)
    } catch (error) {
        console.error('Get user activity error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
