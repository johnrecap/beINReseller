import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { startOfDay, subDays, format } from 'date-fns'

export async function GET(request: Request) {
    try {
        const session = await auth()

        // Check if user is admin
        // Note: Assuming role is in session, if not we might need to fetch user
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        const today = startOfDay(new Date())
        const sevenDaysAgo = subDays(today, 7)

        // Parallelize queries for performance
        const [
            totalUsers,
            totalBalance,
            todayOperations,
            last7DaysOperations,
            recentFailures,
            recentDeposits
        ] = await Promise.all([
            // 1. Total Active Users
            prisma.user.count({
                where: { role: 'RESELLER', isActive: true }
            }),

            // 2. Total Balance in System
            prisma.user.aggregate({
                _sum: { balance: true }
            }),

            // 3. Today's Operations
            prisma.operation.count({
                where: { createdAt: { gte: today } }
            }),

            // 4. Last 7 Days Operations (for success rate & chart)
            prisma.operation.findMany({
                where: { createdAt: { gte: sevenDaysAgo } },
                select: { status: true, createdAt: true }
            }),

            // 5. Recent Failures
            prisma.operation.findMany({
                where: { status: 'FAILED' },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { username: true } } }
            }),

            // 6. Recent Deposits
            prisma.transaction.findMany({
                where: { type: 'DEPOSIT' },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { username: true } } }
            })
        ])

        // Calculate Success Rate (Last 7 Days)
        const successCount = last7DaysOperations.filter(op => op.status === 'COMPLETED').length
        const totalLast7 = last7DaysOperations.length
        const successRate = totalLast7 > 0
            ? Math.round((successCount / totalLast7) * 100)
            : 0

        // Prepare Chart Data (Group by Day)
        const chartData = []
        for (let i = 0; i < 7; i++) {
            const date = subDays(today, i)
            const dateStr = format(date, 'yyyy-MM-dd')
            const dayOps = last7DaysOperations.filter(op =>
                format(new Date(op.createdAt), 'yyyy-MM-dd') === dateStr
            )

            chartData.push({
                date: format(date, 'dd/MM'),
                total: dayOps.length,
                completed: dayOps.filter(op => op.status === 'COMPLETED').length,
                failed: dayOps.filter(op => op.status === 'FAILED').length,
            })
        }
        chartData.reverse() // Show oldest to newest

        return NextResponse.json({
            stats: {
                totalUsers,
                totalBalance: totalBalance._sum.balance || 0,
                todayOperations,
                successRate,
            },
            chartData,
            recentFailures: recentFailures.map(op => ({
                id: op.id,
                user: op.user.username,
                type: 'OPERATION', // placeholder
                status: op.status,
                date: op.createdAt
            })),
            recentDeposits: recentDeposits.map(tx => ({
                id: tx.id,
                user: tx.user.username,
                amount: tx.amount,
                date: tx.createdAt
            }))
        })

    } catch (error) {
        console.error('Admin dashboard error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
