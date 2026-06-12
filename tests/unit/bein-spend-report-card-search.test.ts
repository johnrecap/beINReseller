import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildBeinSpendReportParams,
    type BeinSpendReportFilterState,
} from '@/components/admin/reports/BeinSpendReportClient'
import {
    buildBeinSpendLedgerWhere,
    buildBeinSpendReviewWhere,
    parseBeinSpendReportFilters,
} from '@/lib/bein-spend-ledger'

function baseUiFilters(overrides: Partial<BeinSpendReportFilterState> = {}): BeinSpendReportFilterState {
    return {
        from: '2026-05-01',
        to: '2026-05-25',
        preset: 'month',
        beinAccountId: '',
        userId: '',
        operationType: '',
        cardNumber: '',
        page: 1,
        ...overrides,
    }
}

test('adds card number to summary and detail report request params', () => {
    const filters = baseUiFilters({ cardNumber: ' 7518-695 237 ', page: 3 })
    const summaryParams = buildBeinSpendReportParams(filters, false)
    const detailParams = buildBeinSpendReportParams(filters, true)

    assert.equal(summaryParams.get('cardNumber'), '7518-695 237')
    assert.equal(summaryParams.has('page'), false)
    assert.equal(detailParams.get('cardNumber'), '7518-695 237')
    assert.equal(detailParams.get('page'), '3')
    assert.equal(detailParams.get('pageSize'), '25')
})

test('omits empty card number from report request params', () => {
    const params = buildBeinSpendReportParams(baseUiFilters({ cardNumber: '   ' }), false)

    assert.equal(params.has('cardNumber'), false)
})

test('builds report date range using Egypt day boundaries', () => {
    const params = buildBeinSpendReportParams(baseUiFilters({
        from: '2026-05-26',
        to: '2026-05-27',
    }), false)

    assert.equal(params.get('from'), '2026-05-25T21:00:00.000Z')
    assert.equal(params.get('to'), '2026-05-27T20:59:59.999Z')
})

test('builds report date range using selected Cairo time minutes', () => {
    const params = buildBeinSpendReportParams(baseUiFilters({
        from: '2026-05-26T14:30',
        to: '2026-05-26T15:45',
        cardNumber: '7518-695 237',
        beinAccountId: 'bein-account-1',
        userId: 'panel-user-1',
    }), true)

    assert.equal(params.get('from'), '2026-05-26T11:30:00.000Z')
    assert.equal(params.get('to'), '2026-05-26T12:45:59.999Z')
    assert.equal(params.get('cardNumber'), '7518-695 237')
    assert.equal(params.get('beinAccountId'), 'bein-account-1')
    assert.equal(params.get('userId'), 'panel-user-1')
    assert.equal(params.get('pageSize'), '25')
})

test('combines card, account, and operation type filters in query builders', () => {
    const params = buildBeinSpendReportParams(baseUiFilters({
        cardNumber: '7518-695 237',
        beinAccountId: 'bein-account-1',
        operationType: 'RENEW',
    }), false)
    const filters = parseBeinSpendReportFilters(params)
    const ledgerWhere = buildBeinSpendLedgerWhere(filters)
    const reviewWhere = buildBeinSpendReviewWhere(filters)

    assert.equal(filters.cardNumber, '7518695237')
    assert.deepEqual(ledgerWhere.cardNumberSnapshot, { contains: '7518695237' })
    assert.equal(ledgerWhere.beinAccountId, 'bein-account-1')
    assert.equal(ledgerWhere.operationType, 'RENEW')
    assert.deepEqual(reviewWhere.cardNumber, { contains: '7518695237' })
    assert.equal(reviewWhere.beinAccountId, 'bein-account-1')
    assert.equal(reviewWhere.type, 'RENEW')
})

test('combines card and panel user filters in query builders', () => {
    const params = buildBeinSpendReportParams(baseUiFilters({
        cardNumber: '7518695237',
        userId: 'panel-user-1',
    }), false)
    const filters = parseBeinSpendReportFilters(params)
    const ledgerWhere = buildBeinSpendLedgerWhere(filters)

    assert.deepEqual(ledgerWhere.cardNumberSnapshot, { contains: '7518695237' })
    assert.equal(ledgerWhere.userId, 'panel-user-1')
})
