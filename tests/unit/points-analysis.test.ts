import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildPointAnalysisSummary,
    buildPointAnalysisWhere,
    getPointAnalysisSourceMeta,
    mapPointAnalysisRow,
    parsePointAnalysisFilters,
} from '@/lib/points/analysis'

const owner = {
    id: 'owner-1',
    username: 'Noman329',
    email: 'noman@example.com',
    role: 'USER',
    isActive: true,
    deletedAt: null,
    balance: 0,
}

test('point analysis classifies source labels and directions safely', () => {
    assert.deepEqual(getPointAnalysisSourceMeta('EID_REWARD'), {
        label: 'Eid reward',
        direction: 'earn',
        conversionState: 'available',
    })
    assert.deepEqual(getPointAnalysisSourceMeta('POINT_CASH_REDEMPTION'), {
        label: 'Converted to balance',
        direction: 'convert',
        conversionState: 'converted',
    })
    assert.deepEqual(getPointAnalysisSourceMeta('POINT_REVERSAL'), {
        label: 'Point reversal',
        direction: 'reverse',
        conversionState: 'reversed',
    })
    assert.equal(getPointAnalysisSourceMeta('SOMETHING_NEW').label, 'Unknown source')
})

test('point analysis summary separates earned, available, converted, reversed, pending, cancelled, and legacy points', () => {
    const summary = buildPointAnalysisSummary([
        { ownerUserId: 'owner-1', sourceType: 'EID_REWARD', status: 'AVAILABLE', points: 3 },
        { ownerUserId: 'owner-1', sourceType: 'OPERATION_SPEND', status: 'AVAILABLE', points: 10 },
        {
            ownerUserId: 'owner-1',
            sourceType: 'POINT_CASH_REDEMPTION',
            status: 'REDEEMED',
            points: -5,
            pointCashRedemption: { balanceAmountUsd: 2.5 },
        },
        { ownerUserId: 'owner-1', sourceType: 'POINT_REVERSAL', status: 'REDEEMED', points: -2 },
        { ownerUserId: 'owner-2', sourceType: 'EID_REWARD', status: 'PENDING', points: 4 },
        { ownerUserId: 'owner-3', sourceType: 'EID_REWARD', status: 'CANCELLED', points: 7 },
        { ownerUserId: 'owner-4', sourceType: 'ADMIN_ADJUSTMENT', status: 'AVAILABLE', points: 9 },
    ])

    assert.equal(summary.earnedPoints, 13)
    assert.equal(summary.availablePoints, 6)
    assert.equal(summary.convertedPoints, 5)
    assert.equal(summary.convertedBalanceAmount, 2.5)
    assert.equal(summary.reversedPoints, 2)
    assert.equal(summary.pendingPoints, 4)
    assert.equal(summary.cancelledPoints, 7)
    assert.equal(summary.legacyPoints, 9)
    assert.equal(summary.ownersCount, 4)
    assert.equal(summary.ledgerEntriesCount, 7)
})

test('point analysis row maps owner, source, references, and cairo display time', () => {
    const row = mapPointAnalysisRow({
        id: 'ledger-1',
        ownerUserId: owner.id,
        ownerRoleAtTime: 'USER',
        sourceType: 'OPERATION_SPEND',
        sourceId: 'op-1',
        points: 10,
        status: 'AVAILABLE',
        amountUsdSnapshot: 95,
        ratePerThousandSnapshot: 5,
        createdAt: new Date('2026-05-27T09:30:00.000Z'),
        notes: 'Spend points',
        owner,
        operation: { id: 'op-1', cardNumber: '7515338114', status: 'COMPLETED' },
        pointCashRedemption: null,
    })

    assert.equal(row.ledgerEntryId, 'ledger-1')
    assert.equal(row.sourceLabel, 'Operation spend')
    assert.equal(row.direction, 'earn')
    assert.equal(row.owner.username, 'Noman329')
    assert.equal(row.operationRef?.cardNumber, '7515338114')
    assert.match(row.createdAtDisplay, /2026/)
    assert.equal(row.redemptionRef, null)
})

test('point analysis filters are bounded and validate enum values', () => {
    const filters = parsePointAnalysisFilters({
        page: '0',
        limit: '500',
        role: 'USER',
        sourceType: 'EID_REWARD',
        status: 'AVAILABLE',
        conversionState: 'available',
        ownerSearch: '  admin  ',
        from: '2026-05-27',
        to: '2026-05-27',
    })

    assert.equal(filters.page, 1)
    assert.equal(filters.limit, 100)
    assert.equal(filters.role, 'USER')
    assert.equal(filters.ownerSearch, 'admin')
    assert.ok(filters.from)
    assert.ok(filters.to)

    assert.throws(
        () => parsePointAnalysisFilters({ role: 'ROOT' }),
        /Invalid role/
    )
    assert.throws(
        () => parsePointAnalysisFilters({ conversionState: 'spent' }),
        /Invalid conversion state/
    )
})

test('owner timeline summary can use all owner rows while displayed rows stay paginated', () => {
    const allOwnerEntries = [
        { ownerUserId: 'owner-1', sourceType: 'EID_REWARD', status: 'AVAILABLE', points: 3 },
        { ownerUserId: 'owner-1', sourceType: 'OPERATION_SPEND', status: 'AVAILABLE', points: 4 },
        {
            ownerUserId: 'owner-1',
            sourceType: 'POINT_CASH_REDEMPTION',
            status: 'REDEEMED',
            points: -5,
            pointCashRedemption: { balanceAmountUsd: 2.5 },
        },
    ]
    const currentPageRows = allOwnerEntries.slice(0, 1)

    const summary = buildPointAnalysisSummary(allOwnerEntries)

    assert.equal(currentPageRows.length, 1)
    assert.equal(summary.earnedPoints, 7)
    assert.equal(summary.availablePoints, 2)
    assert.equal(summary.convertedPoints, 5)
})

test('point analysis query builder combines filters without dropping owner search', () => {
    const filters = parsePointAnalysisFilters({
        role: 'USER',
        ownerSearch: 'Noman',
        sourceType: 'EID_REWARD',
        status: 'AVAILABLE',
        conversionState: 'available',
        from: '2026-05-27',
        to: '2026-05-27',
    })

    const where = buildPointAnalysisWhere(filters)

    assert.ok('AND' in where)
    assert.equal(Array.isArray(where.AND), true)
    assert.ok(JSON.stringify(where).includes('Noman'))
    assert.ok(JSON.stringify(where).includes('EID_REWARD'))
    assert.ok(JSON.stringify(where).includes('AVAILABLE'))
})
