/**
 * GET /api/admin/users/inactive
 * 
 * Returns a paginated list of inactive users based on configurable criteria.
 * Admin only endpoint.
 * 
 * Query params:
 * - days: Inactivity threshold in days (default: 30)
 * - role: Filter by role (ADMIN, MANAGER, USER)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - sortBy: Sort field (lastLogin, lastOperation, createdAt)
 * - sortOrder: Sort direction (asc, desc)
 * - search: Search by username or email
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getInactiveUsers } from '@/lib/services/activityTracker'
import { Role } from '@prisma/client'

export async function GET(request: Request) {
    try {
        const session = await auth()
        
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }
        
        const { searchParams } = new URL(request.url)
        
        const days = Math.max(1, parseInt(searchParams.get('days') || '30'))
        const roleParam = searchParams.get('role')
        const role = roleParam && ['ADMIN', 'MANAGER', 'USER'].includes(roleParam) 
            ? roleParam as Role 
            : undefined
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
        const sortByParam = searchParams.get('sortBy')
        const sortBy = ['lastLogin', 'lastOperation', 'createdAt'].includes(sortByParam || '') 
            ? sortByParam as 'lastLogin' | 'lastOperation' | 'createdAt'
            : 'lastLogin'
        const sortOrderParam = searchParams.get('sortOrder')
        const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc'
        const search = searchParams.get('search') || undefined
        
        const result = await getInactiveUsers({
            inactiveDays: days,
            role,
            page,
            limit,
            sortBy,
            sortOrder,
            search
        })
        
        return NextResponse.json({
            ...result,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit),
            filters: { days, role, sortBy, sortOrder, search }
        })
    } catch (error) {
        console.error('Get inactive users error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
