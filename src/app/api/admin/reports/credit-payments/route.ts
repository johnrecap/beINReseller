import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildCreditDebtPaymentDailySummary,
    buildCreditDebtPaymentReportSummary,
    buildCreditDebtPaymentReportWhere,
    parseCreditDebtPaymentReportFilters,
} from '@/lib/credit-requests/payment-report'
import { utcIsoToCairoDateInput } from '@/lib/egypt-time'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const filters = parseCreditDebtPaymentReportFilters(new URL(request.url).searchParams)
        const where = buildCreditDebtPaymentReportWhere(filters)
        const skip = (filters.page - 1) * filters.limit

        const [rows, total, summaryRows] = await Promise.all([
            prisma.creditDebtLedgerEntry.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: filters.limit,
                select: {
                    id: true,
                    userId: true,
                    amountUsd: true,
                    debtAfterUsd: true,
                    ownerTypeSnapshot: true,
                    ownerIdSnapshot: true,
                    ownerLabelSnapshot: true,
                    recordedByUserId: true,
                    note: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                        },
                    },
                    recordedBy: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            role: true,
                        },
                    },
                },
            }),
            prisma.creditDebtLedgerEntry.count({ where }),
            prisma.creditDebtLedgerEntry.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                select: {
                    userId: true,
                    recordedByUserId: true,
                    amountUsd: true,
                    createdAt: true,
                },
            }),
        ])

        const totalPages = Math.max(1, Math.ceil(total / filters.limit))

        return NextResponse.json({
            filters: {
                page: filters.page,
                limit: filters.limit,
                range: filters.range,
                from: filters.from?.toISOString() ?? null,
                to: filters.to?.toISOString() ?? null,
                fromInput: filters.fromInput,
                toInput: filters.toInput,
                userSearch: filters.userSearch,
                recordedBySearch: filters.recordedBySearch,
            },
            summary: buildCreditDebtPaymentReportSummary(summaryRows),
            daily: buildCreditDebtPaymentDailySummary(summaryRows),
            rows: rows.map((row) => ({
                id: row.id,
                amountUsd: row.amountUsd,
                debtAfterUsd: row.debtAfterUsd,
                ownerTypeSnapshot: row.ownerTypeSnapshot,
                ownerIdSnapshot: row.ownerIdSnapshot,
                ownerLabelSnapshot: row.ownerLabelSnapshot,
                note: row.note,
                createdAt: row.createdAt.toISOString(),
                createdAtCairoDate: utcIsoToCairoDateInput(row.createdAt.toISOString()),
                user: row.user,
                recordedBy: row.recordedBy,
            })),
            pagination: {
                page: filters.page,
                limit: filters.limit,
                total,
                totalPages,
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Server error'
        if (message.includes('payment report date range')) {
            return NextResponse.json({ error: message }, { status: 400 })
        }

        console.error('Credit debt payment report error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

