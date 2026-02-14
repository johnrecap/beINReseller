import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, subDays, format } from 'date-fns'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const today = startOfDay(new Date())
        const last7Days = subDays(today, 6)

        const [
            // User stats
            totalUsersCount,
            activeUsersCount,
            totalBalance,

            // Operation stats
            totalOperationsCount,
            todayOperationsCount,
            pendingOperationsCount,
            last7DaysOperations,

            // Revenue stats
            totalRevenueResult,
            todayRevenueResult,

            // beIN accounts & proxies
            activeBeinAccountsCount,
            beinAccountsHealth,
            activeProxiesCount,

            // For charts and lists
            recentFailedOperations,
            recentDeposits,
            dailyOperations
        ] = await Promise.all([
            // Total users
            prisma.user.count(),

            // Active users (logged in within last 30 days or isActive)
            prisma.user.count({
                where: {
                    isActive: true,
                    deletedAt: null
                }
            }),

            // Total balance across all users
            prisma.user.aggregate({
                _sum: { balance: true }
            }),

            // Total operations (all time)
            prisma.operation.count(),

            // Today's operations count
            prisma.operation.count({
                where: { createdAt: { gte: today } }
            }),

            // Pending operations
            prisma.operation.count({
                where: {
                    status: {
                        in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING']
                    }
                }
            }),

            // Last 7 days operations for success rate
            prisma.operation.groupBy({
                by: ['status'],
                where: { createdAt: { gte: last7Days } },
                _count: { id: true }
            }),

            // Total revenue (sum of completed operation amounts)
            prisma.operation.aggregate({
                where: { status: 'COMPLETED' },
                _sum: { amount: true }
            }),

            // Today's revenue
            prisma.operation.aggregate({
                where: {
                    status: 'COMPLETED',
                    createdAt: { gte: today }
                },
                _sum: { amount: true }
            }),

            // Active beIN accounts
            prisma.beinAccount.count({
                where: { isActive: true }
            }),

            // beIN accounts health check (for worker status)
            prisma.beinAccount.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    consecutiveFailures: true,
                    lastUsedAt: true,
                    lastError: true
                },
                take: 10
            }),

            // Active proxies
            prisma.proxy.count({
                where: { isActive: true }
            }),

            // Recent failed operations
            prisma.operation.findMany({
                where: { status: 'FAILED' },
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    status: true,
                    error: true,
                    responseMessage: true,
                    cardNumber: true,
                    type: true,
                    createdAt: true,
                    user: { select: { username: true } }
                }
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
                    DATE("created_at") as date,
                    COUNT(*)::int as total,
                    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)::int as completed,
                    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::int as failed
                FROM "operations"
                WHERE "created_at" >= ${last7Days}
                GROUP BY DATE("created_at")
                ORDER BY date ASC
            `.catch((err) => { console.error('Chart query error:', err); return [] })
        ])

        // Calculate success rate from last 7 days
        const totalOps = last7DaysOperations.reduce((sum, g) => sum + g._count.id, 0)
        const completedOps = last7DaysOperations.find(g => g.status === 'COMPLETED')?._count.id ?? 0
        const successRate = totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : 0

        // Determine worker status based on beIN accounts health
        let workerStatus: 'healthy' | 'running' | 'unknown' = 'unknown'
        if (beinAccountsHealth.length > 0) {
            const healthyAccounts = beinAccountsHealth.filter(acc => acc.consecutiveFailures < 3)
            if (healthyAccounts.length === beinAccountsHealth.length) {
                workerStatus = 'healthy'
            } else if (healthyAccounts.length > 0) {
                workerStatus = 'running'
            } else {
                // All accounts have issues
                workerStatus = 'unknown'
            }
        }

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
            error: op.error || op.responseMessage || null,
            cardNumber: op.cardNumber ? `****${op.cardNumber.slice(-4)}` : null,
            type: op.type,
            date: op.createdAt.toISOString()
        }))

        // Format recent deposits for component
        const formattedRecentDeposits = recentDeposits.map(tx => ({
            id: tx.id,
            user: tx.user?.username ?? 'Unknown',
            amount: tx.amount,
            date: tx.createdAt.toISOString()
        }))

        // Return stats with field names matching Flutter expectations
        return NextResponse.json({
            // Stats object with all fields Flutter expects
            stats: {
                // User stats
                totalUsers: totalUsersCount,
                activeUsers: activeUsersCount,

                // Operation stats
                totalOperations: totalOperationsCount,
                operationsToday: todayOperationsCount,  // Flutter expects this name
                pendingOperations: pendingOperationsCount,

                // Revenue stats
                totalRevenue: totalRevenueResult._sum.amount ?? 0,
                revenueToday: todayRevenueResult._sum.amount ?? 0,

                // Legacy field (keep for web dashboard compatibility)
                totalBalance: totalBalance._sum.balance ?? 0,
                todayOperations: todayOperationsCount,  // Keep legacy name too

                // System stats
                activeBeinAccounts: activeBeinAccountsCount,
                activeProxies: activeProxiesCount,
                workerStatus: workerStatus,

                // Performance stats
                successRate: successRate
            },

            // Also expose at root level for Flutter (it checks both stats.X and X)
            totalUsers: totalUsersCount,
            activeUsers: activeUsersCount,
            totalOperations: totalOperationsCount,
            operationsToday: todayOperationsCount,
            pendingOperations: pendingOperationsCount,
            totalRevenue: totalRevenueResult._sum.amount ?? 0,
            revenueToday: todayRevenueResult._sum.amount ?? 0,
            activeBeinAccounts: activeBeinAccountsCount,
            activeProxies: activeProxiesCount,
            workerStatus: workerStatus,

            // Chart and list data
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
