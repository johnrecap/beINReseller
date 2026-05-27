import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildPointAnalysisSummary,
    buildPointAnalysisWhere,
    mapPointAnalysisRow,
    parsePointAnalysisFilters,
} from '@/lib/points/analysis'
import { getConversionReadiness, getPointProgramSettings } from '@/lib/points/settings'

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

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const filters = parsePointAnalysisFilters(new URL(request.url).searchParams)
        const where = buildPointAnalysisWhere(filters)
        const skip = (filters.page - 1) * filters.limit

        const [settings, total, summaryEntries, rows] = await Promise.all([
            getPointProgramSettings(prisma),
            prisma.pointLedgerEntry.count({ where }),
            prisma.pointLedgerEntry.findMany({
                where,
                select: {
                    ownerUserId: true,
                    sourceType: true,
                    status: true,
                    points: true,
                    pointCashRedemption: { select: { balanceAmountUsd: true } },
                },
            }),
            prisma.pointLedgerEntry.findMany({
                where,
                select: rowSelect,
                orderBy: { createdAt: 'desc' },
                skip,
                take: filters.limit,
            }),
        ])

        const readiness = getConversionReadiness(settings)

        return NextResponse.json({
            summary: buildPointAnalysisSummary(summaryEntries),
            filters: {
                page: filters.page,
                limit: filters.limit,
                from: filters.from?.toISOString() ?? null,
                to: filters.to?.toISOString() ?? null,
                role: filters.role,
                ownerSearch: filters.ownerSearch,
                sourceType: filters.sourceType,
                status: filters.status,
                conversionState: filters.conversionState,
            },
            rows: rows.map(mapPointAnalysisRow),
            pagination: {
                page: filters.page,
                limit: filters.limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / filters.limit)),
            },
            settings: {
                pointsEnabled: settings.pointsEnabled,
                conversionEnabled: readiness.ok,
                conversionPoints: settings.cashConversionPoints,
                conversionAmount: settings.cashConversionAmountUsd,
                currencyLabel: 'USD',
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Server error'
        if (message.startsWith('Invalid ')) {
            return NextResponse.json({ error: message }, { status: 400 })
        }

        console.error('points analysis report error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
