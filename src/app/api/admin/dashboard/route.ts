import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { startOfDay, subDays, format } from 'date-fns'

export async function GET() {
    try {
        const session = await auth()

        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'UNAUTHORIZED' },
                { status: 401 }
            )
        }

        const today = startOfDay(new Date())
        const last7Days = subDays(today, 6)

        const [
            usersCount,
            totalBalance,
            todayOperationsCount,
            last7DaysOperations,
            recentFailedOperations,
            recentDeposits,
            dailyOperations
        ] = await Promise.all([
            // Total users
            prisma.user.count(),

            // Total balance across all users
            prisma.user.aggregate({
                _sum: { balance: true }
            }),

            // Today's operations count
            prisma.operation.count({
                where: { createdAt: { gte: today } }
            }),

            // Last 7 days operations for success rate
            prisma.operation.groupBy({
                by: ['status'],
                where: { createdAt: { gte: last7Days } },
                _count: { id: true }
            }),

            // Recent failed operations
            prisma.operation.findMany({
                where: { status: 'FAILED' },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { username: true } } }
            }),

            // Recent deposits (transactions)
            prisma.transaction.findMany({
                where: { type: 'DEPOSIT' },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { username: true } } }
            }),

            // Daily stats for chart
            prisma.$queryRaw<{ date: string; total: number; completed: number; failed: number }[]>`
                SELECT 
                    DATE("createdAt") as date,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
                FROM "Operation"
                WHERE "createdAt" >= ${last7Days}
                GROUP BY DATE("createdAt")
                ORDER BY date ASC
            `.catch(() => []) // Fallback if raw query fails
        ])

        // Calculate success rate from last 7 days
        const totalOps = last7DaysOperations.reduce((sum, g) => sum + g._count.id, 0)
        const completedOps = last7DaysOperations.find(g => g.status === 'COMPLETED')?._count.id ?? 0
        const successRate = totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : 0

        // Format chart data - ensure 7 days
        const chartData = []
        for (let i = 0; i < 7; i++) {
            const date = subDays(today, 6 - i)
            const dateStr = format(date, 'yyyy-MM-dd')
            const dayData = (dailyOperations as { date: string; total: number; completed: number; failed: number }[]).find(d =>
                format(new Date(d.date), 'yyyy-MM-dd') === dateStr
            )
            chartData.push({
                date: format(date, 'MM/dd'),
                total: Number(dayData?.total ?? 0),
                completed: Number(dayData?.completed ?? 0),
                failed: Number(dayData?.failed ?? 0)
            })
        }

        // Format recent failures for component
        const recentFailures = recentFailedOperations.map(op => ({
            id: op.id,
            user: op.user?.username ?? 'Unknown',
            status: op.status,
            date: op.createdAt.toISOString()
        }))

        // Format recent deposits for component
        const formattedRecentDeposits = recentDeposits.map(tx => ({
            id: tx.id,
            user: tx.user?.username ?? 'Unknown',
            amount: tx.amount,
            date: tx.createdAt.toISOString()
        }))

        return NextResponse.json({
            stats: {
                totalUsers: usersCount,
                totalBalance: totalBalance._sum.balance ?? 0,
                todayOperations: todayOperationsCount,
                successRate: successRate
            },
            chartData,
            recentFailures,
            recentDeposits: formattedRecentDeposits
        })
    } catch (error) {
        console.error('Admin dashboard error:', error)
        return NextResponse.json(
            { error: 'SERVER_ERROR' },
            { status: 500 }
        )
    }
}
