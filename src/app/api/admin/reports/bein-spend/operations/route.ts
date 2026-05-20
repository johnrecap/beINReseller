import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    getBeinSpendOperations,
    parseBeinSpendReportFilters,
    parsePagination,
} from '@/lib/bein-spend-ledger'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const searchParams = new URL(request.url).searchParams
        const filters = parseBeinSpendReportFilters(searchParams)
        const pagination = parsePagination(searchParams)
        const pageSize = pagination.pageSize
        const result = await getBeinSpendOperations(filters, pagination)

        return NextResponse.json({
            ...result,
            pageSize,
            items: result.items.map((item) => ({
                ...item,
                chargedAt: item.chargedAt.toISOString(),
            })),
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Server error'
        if (
            message.includes('date range') ||
            message.includes('Missing required') ||
            message.includes('exceeds maximum')
        ) {
            return NextResponse.json({ error: message }, { status: 400 })
        }

        console.error('beIN spend operations report error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
