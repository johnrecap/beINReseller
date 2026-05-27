import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildPointAnalysisSummary,
    buildPointAnalysisWhere,
    mapPointAnalysisRow,
    parsePointAnalysisFilters,
} from '@/lib/points/analysis'

const rowSelect = {
    id: true,
    ownerUserId: true,
    ownerRoleAtTime: true,
    sourceType: true,
    sourceId: true,
    points: true,
    status: true,
    amountUsdSnapshot: true,
    ratePerThousandSnapshot: true,
    createdAt: true,
    notes: true,
    owner: {
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            isActive: true,
            deletedAt: true,
            balance: true,
        },
    },
    operation: {
        select: {
            id: true,
            cardNumber: true,
            status: true,
        },
    },
    pointCashRedemption: {
        select: {
            id: true,
            pointsConverted: true,
            balanceAmountUsd: true,
            conversionPointsSnapshot: true,
            conversionAmountUsdSnapshot: true,
            transaction: {
                select: {
                    id: true,
                    amount: true,
                    balanceAfter: true,
                },
            },
        },
    },
} as const

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const owner = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isActive: true,
                deletedAt: true,
                balance: true,
            },
        })

        if (!owner) {
            return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
        }

        const filters = parsePointAnalysisFilters(new URL(request.url).searchParams)
        const where = buildPointAnalysisWhere(filters)
        const scopedWhere = { AND: [where, { ownerUserId: id }] }
        const skip = (filters.page - 1) * filters.limit

        const [total, summaryEntries, rows] = await Promise.all([
            prisma.pointLedgerEntry.count({ where: scopedWhere }),
            prisma.pointLedgerEntry.findMany({
                where: scopedWhere,
                select: {
                    ownerUserId: true,
                    sourceType: true,
                    status: true,
                    points: true,
                    pointCashRedemption: { select: { balanceAmountUsd: true } },
                },
            }),
            prisma.pointLedgerEntry.findMany({
                where: scopedWhere,
                select: rowSelect,
                orderBy: { createdAt: 'desc' },
                skip,
                take: filters.limit,
            }),
        ])

        return NextResponse.json({
            owner: {
                id: owner.id,
                username: owner.username,
                email: owner.email,
                role: owner.role,
                isActive: owner.isActive,
                deleted: Boolean(owner.deletedAt),
                balance: owner.balance,
            },
            summary: buildPointAnalysisSummary(summaryEntries),
            rows: rows.map(mapPointAnalysisRow),
            pagination: {
                page: filters.page,
                limit: filters.limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / filters.limit)),
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Server error'
        if (message.startsWith('Invalid ')) {
            return NextResponse.json({ error: message }, { status: 400 })
        }

        console.error('points analysis owner report error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
