import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

export async function GET(request: NextRequest) {
    try {
        // Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')

        // Build where clause
        const where: Prisma.TransactionWhereInput = {
            userId: authUser.id,
        }

        // Parallel queries for efficiency
        const [transactions, total, userStats, deposits, withdrawals] = await Promise.all([
            // 1. Get paginated transactions
            prisma.transaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    type: true,
                    amount: true,
                    balanceAfter: true,
                    notes: true,
                    createdAt: true,
                    operationId: true,
                },
            }),
            // 2. Get total count
            prisma.transaction.count({ where }),
            // 3. Get user balance
            prisma.user.findUnique({
                where: { id: authUser.id },
                select: { balance: true }
            }),
            // 4. Get total deposits (positive amounts)
            prisma.transaction.aggregate({
                where: { ...where, amount: { gt: 0 } },
                _sum: { amount: true }
            }),
            // 5. Get total withdrawals (negative amounts)
            prisma.transaction.aggregate({
                where: { ...where, amount: { lt: 0 } },
                _sum: { amount: true }
            }),
        ])

        return NextResponse.json({
            transactions,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            stats: {
                currentBalance: userStats?.balance || 0,
                totalDeposits: deposits._sum.amount || 0,
                totalWithdrawals: Math.abs(withdrawals._sum.amount || 0), // Return positive value for display
            }
        })

    } catch (error) {
        console.error('List transactions error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
