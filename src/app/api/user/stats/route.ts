import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = session.user.id
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Get user data with fresh balance
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { balance: true, lowBalanceAlert: true }
        })

        // Count today's operations
        const todayOperations = await prisma.operation.count({
            where: {
                userId,
                createdAt: { gte: today }
            }
        })

        // Get last operation
        const lastOperation = await prisma.operation.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                type: true,
                cardNumber: true,
                status: true,
                createdAt: true
            }
        })

        // Calculate success rate (last 7 days)
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const recentOps = await prisma.operation.groupBy({
            by: ['status'],
            where: {
                userId,
                createdAt: { gte: sevenDaysAgo }
            },
            _count: true
        })

        let successRate = 100
        const totalOps = recentOps.reduce((sum, op) => sum + op._count, 0)
        if (totalOps > 0) {
            const completedOps = recentOps.find(op => op.status === 'COMPLETED')?._count || 0
            successRate = Math.round((completedOps / totalOps) * 100)
        }

        return NextResponse.json({
            balance: user?.balance || 0,
            lowBalanceAlert: user?.lowBalanceAlert || 50,
            todayOperations,
            lastOperation,
            successRate
        })
    } catch (error) {
        console.error('Stats API error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
