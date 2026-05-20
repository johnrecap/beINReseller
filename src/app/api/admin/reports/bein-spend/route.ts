import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { getBeinSpendSummary, parseBeinSpendReportFilters } from '@/lib/bein-spend-ledger'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const filters = parseBeinSpendReportFilters(new URL(request.url).searchParams)
        const report = await getBeinSpendSummary(filters)

        return NextResponse.json({
            range: {
                from: report.range.from.toISOString(),
                to: report.range.to.toISOString(),
                groupBy: report.range.groupBy,
            },
            totals: {
                ...report.totals,
                currency: report.currency,
            },
            accounts: report.accounts.map((account) => ({
                ...account,
                lastChargedAt: account.lastChargedAt.toISOString(),
            })),
            buckets: report.buckets.map((bucket) => ({
                ...bucket,
                bucketStart: bucket.bucketStart.toISOString(),
                bucketEnd: bucket.bucketEnd.toISOString(),
            })),
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Server error'
        if (message.includes('date range') || message.includes('Missing required')) {
            return NextResponse.json({ error: message || 'Invalid date range' }, { status: 400 })
        }

        console.error('beIN spend summary report error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
