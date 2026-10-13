import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { getUserStatsReport } from '@/lib/users/stats-report'

/**
 * GET /api/admin/users/[id]/stats
 *
 * Fetch user financial and operations statistics.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const stats = await getUserStatsReport(userId, {
            txLimit: parseInt(searchParams.get('txLimit') || '20'),
            txSkip: parseInt(searchParams.get('txSkip') || '0'),
            opLimit: parseInt(searchParams.get('opLimit') || '20'),
            opSkip: parseInt(searchParams.get('opSkip') || '0'),
        }, { includeReceiptAvailability: true })

        if (!stats) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        return NextResponse.json(stats)
    } catch (error) {
        console.error('Get user stats error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
