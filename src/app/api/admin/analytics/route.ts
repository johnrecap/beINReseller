import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/admin/analytics - Get comprehensive analytics data
 */
export async function GET(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const days = parseInt(searchParams.get('days') || '30')

        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        // Parallel queries for optimal performance
        const [
            operationsByDay,
            operationsByType,
            operationsByStatus,
            topUsers,
            hourlyStats,
            totalStats,
        ] = await Promise.all([
            // Operations per day
            prisma.$queryRaw<{ date: Date; count: bigint; revenue: number }[]>`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as count,
                    COALESCE(SUM(amount), 0) as revenue
                FROM operations 
                WHERE created_at >= ${startDate}
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            `,

            // Operations by type
            prisma.operation.groupBy({
                by: ['type'],
                _count: true,
                _sum: { amount: true },
                where: { createdAt: { gte: startDate } },
            }),

            // Operations by status
            prisma.operation.groupBy({
                by: ['status'],
                _count: true,
                where: { createdAt: { gte: startDate } },
            }),

            // Top 10 users by operations
            prisma.user.findMany({
                where: { role: 'USER' },
                select: {
                    id: true,
                    username: true,
                    _count: {
                        select: { operations: { where: { createdAt: { gte: startDate } } } },
                    },
                    operations: {
                        where: { createdAt: { gte: startDate } },
                        select: { amount: true },
                    },
                },
                orderBy: { operations: { _count: 'desc' } },
                take: 10,
            }),

            // Hourly distribution
            prisma.$queryRaw<{ hour: number; count: bigint }[]>`
                SELECT 
                    EXTRACT(HOUR FROM created_at) as hour,
                    COUNT(*) as count
                FROM operations 
                WHERE created_at >= ${startDate}
                GROUP BY EXTRACT(HOUR FROM created_at)
                ORDER BY hour ASC
            `,

            // Total stats
            prisma.operation.aggregate({
                where: { createdAt: { gte: startDate } },
                _count: true,
                _sum: { amount: true },
            }),
        ])

        // Process operations by day for chart
        const dailyData = operationsByDay.map(row => ({
            date: row.date.toISOString().split('T')[0],
            operations: Number(row.count),
            revenue: Number(row.revenue) || 0,
        }))

        // Process operations by type
        const typeData = operationsByType.map(row => ({
            type: row.type,
            label: getTypeLabel(row.type),
            count: row._count,
            revenue: row._sum.amount || 0,
        }))

        // Process status distribution
        const statusData = operationsByStatus.map(row => ({
            status: row.status,
            label: getStatusLabel(row.status),
            count: row._count,
        }))

        // Calculate success rate
        const completedCount = operationsByStatus.find(s => s.status === 'COMPLETED')?._count || 0
        const totalCount = totalStats._count || 1
        const successRate = ((completedCount / totalCount) * 100).toFixed(1)

        // Process top users
        const topUsersData = topUsers.map(user => ({
            id: user.id,
            username: user.username,
            operationsCount: user._count.operations,
            totalRevenue: user.operations.reduce((sum, op) => sum + op.amount, 0),
        }))

        // Process hourly data
        const hourlyData = Array.from({ length: 24 }, (_, i) => {
            const found = hourlyStats.find(h => Number(h.hour) === i)
            return {
                hour: i,
                label: `${i.toString().padStart(2, '0')}:00`,
                count: found ? Number(found.count) : 0,
            }
        })

        return NextResponse.json({
            period: { days, startDate: startDate.toISOString() },
            summary: {
                totalOperations: totalStats._count || 0,
                totalRevenue: totalStats._sum.amount || 0,
                successRate: parseFloat(successRate),
                avgOperationsPerDay: Math.round((totalStats._count || 0) / days),
            },
            charts: {
                daily: dailyData,
                byType: typeData,
                byStatus: statusData,
                hourly: hourlyData,
            },
            topUsers: topUsersData,
        })

    } catch (error) {
        console.error('Analytics error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        RENEW: 'تجديد',
        CHECK_BALANCE: 'استعلام رصيد',
        SIGNAL_REFRESH: 'تحديث إشارة',
    }
    return labels[type] || type
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        PENDING: 'قيد الانتظار',
        PROCESSING: 'جاري التنفيذ',
        COMPLETED: 'مكتملة',
        FAILED: 'فاشلة',
        CANCELLED: 'ملغاة',
    }
    return labels[status] || status
}
