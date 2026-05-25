import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const page = Math.max(1, Number(searchParams.get('page') || 1))
        const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 25)))
        const search = searchParams.get('search')?.trim()

        const where = {
            ledgerEntry: {
                sourceType: 'POINT_CASH_REDEMPTION' as const,
                notes: { contains: 'Eid reward', mode: 'insensitive' as const },
            },
            ...(search
                ? {
                    owner: {
                        OR: [
                            { username: { contains: search, mode: 'insensitive' as const } },
                            { email: { contains: search, mode: 'insensitive' as const } },
                        ],
                    },
                }
                : {}),
        }

        const [total, redemptions] = await Promise.all([
            prisma.pointCashRedemption.count({ where }),
            prisma.pointCashRedemption.findMany({
                where,
                orderBy: { requestedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    pointsConverted: true,
                    balanceAmountUsd: true,
                    conversionPointsSnapshot: true,
                    conversionAmountUsdSnapshot: true,
                    ledgerEntryId: true,
                    transactionId: true,
                    requestedAt: true,
                    owner: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            role: true,
                        },
                    },
                    transaction: {
                        select: {
                            amount: true,
                            balanceAfter: true,
                            createdAt: true,
                            notes: true,
                        },
                    },
                },
            }),
        ])

        return NextResponse.json({
            transactions: redemptions.map((redemption) => ({
                ...redemption,
                requestedAt: redemption.requestedAt.toISOString(),
                transaction: {
                    ...redemption.transaction,
                    createdAt: redemption.transaction.createdAt.toISOString(),
                },
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        })
    } catch (error) {
        console.error('Admin Eid transactions GET error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
