/**
 * GET /api/admin/analytics/activity
 * 
 * Returns comprehensive activity analytics including:
 * - Inactivity metrics breakdown
 * - Login trends by day
 * - Operation trends by day
 * - Top active users
 * 
 * Admin only endpoint.
 * 
 * Query params:
 * - days: Analysis period in days (default: 30)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { calculateInactivityMetrics, getActivityTrends } from '@/lib/services/activityTracker'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        
        const { searchParams } = new URL(request.url)
        const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '30')))
        
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)
        
        const [inactivityMetrics, activityTrends] = await Promise.all([
            calculateInactivityMetrics(),
            getActivityTrends(days)
        ])
        
        return NextResponse.json({
            period: { 
                days, 
                startDate: startDate.toISOString(),
                endDate: new Date().toISOString()
            },
            inactivityMetrics,
            charts: {
                loginsByDay: activityTrends.loginsByDay,
                operationsByDay: activityTrends.operationsByDay
            },
            topActiveUsers: activityTrends.topActiveUsers
        })
    } catch (error) {
        console.error('Activity analytics error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
