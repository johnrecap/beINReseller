import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildBeinSpendLedgerWhere,
    buildBeinSpendReviewWhere,
    normalizeCardSearch,
    parseBeinSpendReportFilters,
} from '@/lib/bein-spend-ledger'

test('normalizes card search input to digits', () => {
    assert.equal(normalizeCardSearch(' 7518-695 237 '), '7518695237')
    assert.equal(normalizeCardSearch('card: 7518695237'), '7518695237')
    assert.equal(normalizeCardSearch(''), undefined)
    assert.equal(normalizeCardSearch('abc'), undefined)
})

test('parses normalized card number in beIN spend filters', () => {
    const filters = parseBeinSpendReportFilters(new URLSearchParams({
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-25T23:59:59.999Z',
        groupBy: 'month',
        cardNumber: ' 7518-695 237 ',
        beinAccountId: 'bein-account-1',
        userId: 'panel-user-1',
        operationType: 'RENEW',
    }))

    assert.equal(filters.cardNumber, '7518695237')
    assert.equal(filters.beinAccountId, 'bein-account-1')
    assert.equal(filters.userId, 'panel-user-1')
    assert.equal(filters.operationType, 'RENEW')
})

test('builds matching ledger and review card filters', () => {
    const filters = parseBeinSpendReportFilters(new URLSearchParams({
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-25T23:59:59.999Z',
        cardNumber: '7518695237',
    }))

    const ledgerWhere = buildBeinSpendLedgerWhere(filters)
    const reviewWhere = buildBeinSpendReviewWhere(filters)

    assert.deepEqual(ledgerWhere.cardNumberSnapshot, { contains: '7518695237' })
    assert.deepEqual(reviewWhere.cardNumber, { contains: '7518695237' })
})
