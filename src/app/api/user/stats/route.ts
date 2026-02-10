import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session or mobile token
 */
async function getAuthUser(request: NextRequest) {
    // Try NextAuth session first
    const session = await auth()
    if (session?.user?.id) {
        return session.user
    }
    // Try mobile token
    return getMobileUserFromRequest(request)
}

export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)

        if (!authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = authUser.id
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
        // Only count COMPLETED and FAILED (exclude PENDING, PROCESSING, CANCELLED)
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const recentOps = await prisma.operation.groupBy({
            by: ['status'],
            where: {
                userId,
                createdAt: { gte: sevenDaysAgo },
                status: { in: ['COMPLETED', 'FAILED'] }
            },
            _count: true
        })

        let successRate = 0
        const completedOps = recentOps.find(op => op.status === 'COMPLETED')?._count || 0
        const failedOps = recentOps.find(op => op.status === 'FAILED')?._count || 0
        const totalFinished = completedOps + failedOps

        if (totalFinished > 0) {
            successRate = Math.round((completedOps / totalFinished) * 100)
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
