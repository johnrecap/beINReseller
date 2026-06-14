import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildCreditDebtPaymentReportSummary,
    buildCreditDebtPaymentReportWhere,
    parseCreditDebtPaymentReportFilters,
} from '@/lib/credit-requests/payment-report'

test('builds a today payment report range from Cairo date boundaries', () => {
    const filters = parseCreditDebtPaymentReportFilters(
        new URLSearchParams('range=today'),
        new Date('2026-06-14T10:00:00.000Z')
    )

    assert.equal(filters.range, 'today')
    assert.equal(filters.from?.toISOString(), '2026-06-13T21:00:00.000Z')
    assert.equal(filters.to?.toISOString(), '2026-06-14T20:59:59.999Z')
})

test('builds this-week and this-month payment report ranges in Cairo time', () => {
    const now = new Date('2026-06-17T10:00:00.000Z')
    const week = parseCreditDebtPaymentReportFilters(new URLSearchParams('range=week'), now)
    const month = parseCreditDebtPaymentReportFilters(new URLSearchParams('range=month'), now)

    assert.equal(week.from?.toISOString(), '2026-06-13T21:00:00.000Z')
    assert.equal(week.to?.toISOString(), '2026-06-17T20:59:59.999Z')
    assert.equal(month.from?.toISOString(), '2026-05-31T21:00:00.000Z')
    assert.equal(month.to?.toISOString(), '2026-06-17T20:59:59.999Z')
})

test('builds custom payment report ranges and filters only recorded payments', () => {
    const filters = parseCreditDebtPaymentReportFilters(
        new URLSearchParams('range=custom&from=2026-06-10&to=2026-06-12&recordedBySearch=agent&userSearch=ali&page=2&limit=50')
    )
    const where = buildCreditDebtPaymentReportWhere(filters)

    assert.equal(filters.page, 2)
    assert.equal(filters.limit, 50)
    assert.equal(filters.from?.toISOString(), '2026-06-09T21:00:00.000Z')
    assert.equal(filters.to?.toISOString(), '2026-06-12T20:59:59.999Z')
    assert.equal(where.entryType, 'PAYMENT_RECORDED')
    assert.deepEqual(where.createdAt, { gte: filters.from, lte: filters.to })
    assert.ok(where.AND)
})

test('summarizes payment report rows by amount, users, and recorders', () => {
    const summary = buildCreditDebtPaymentReportSummary([
        { userId: 'user-1', recordedByUserId: 'agent-1', amountUsd: 100 },
        { userId: 'user-1', recordedByUserId: 'agent-1', amountUsd: 50 },
        { userId: 'user-2', recordedByUserId: 'admin-1', amountUsd: 25.5 },
    ])

    assert.deepEqual(summary, {
        totalPaidUsd: 175.5,
        paymentCount: 3,
        usersCount: 2,
        recordersCount: 2,
    })
})
