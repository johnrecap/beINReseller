import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { getUserStatsReport } from '@/lib/users/stats-report'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const authResult = await requireRoleAPIWithMobile(request, 'MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                deletedAt: true,
                managerLink: {
                    where: { managerId: authResult.user.id },
                    select: { id: true },
                },
            },
        })

        if (!targetUser || targetUser.deletedAt || targetUser.role !== 'USER') {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (authResult.user.role !== 'ADMIN' && targetUser.managerLink.length === 0) {
            return NextResponse.json({ error: 'You do not have permission to view this user' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const stats = await getUserStatsReport(userId, {
            txLimit: parseInt(searchParams.get('txLimit') || '20'),
            txSkip: parseInt(searchParams.get('txSkip') || '0'),
            opLimit: parseInt(searchParams.get('opLimit') || '20'),
            opSkip: parseInt(searchParams.get('opSkip') || '0'),
        })

        if (!stats) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        return NextResponse.json(stats)
    } catch (error) {
        console.error('Get manager user stats error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
