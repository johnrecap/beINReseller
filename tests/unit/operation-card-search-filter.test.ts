import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildOperationListWhere,
    normalizeOperationCardSearch,
} from '@/lib/operation-list-filters'

test('normalizes operation history card search to digits with minimum length', () => {
    assert.equal(normalizeOperationCardSearch(' 7518-695 237 '), '7518695237')
    assert.equal(normalizeOperationCardSearch('card: 7518'), '7518')
    assert.equal(normalizeOperationCardSearch('751'), undefined)
    assert.equal(normalizeOperationCardSearch('abc'), undefined)
    assert.equal(normalizeOperationCardSearch(''), undefined)
})

test('builds operation list where with user ownership and card search', () => {
    const where = buildOperationListWhere('user-1', new URLSearchParams({
        cardNumber: ' 7518-695 237 ',
    }))

    assert.equal(where.userId, 'user-1')
    assert.deepEqual(where.cardNumber, { contains: '7518695237' })
})

test('preserves existing type, status, and date filters', () => {
    const where = buildOperationListWhere('user-1', new URLSearchParams({
        type: 'RENEW',
        status: 'COMPLETED',
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-25T23:59:59.999Z',
    }))

    assert.equal(where.userId, 'user-1')
    assert.equal(where.type, 'RENEW')
    assert.equal(where.status, 'COMPLETED')
    assert.deepEqual(where.createdAt, {
        gte: new Date('2026-05-01T00:00:00.000Z'),
        lte: new Date('2026-05-25T23:59:59.999Z'),
    })
})

test('preserves active status expansion with card filter', () => {
    const where = buildOperationListWhere('user-1', new URLSearchParams({
        status: 'active',
        cardNumber: '7518695237',
    }))

    assert.deepEqual(where.status, {
        in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING'],
    })
    assert.deepEqual(where.cardNumber, { contains: '7518695237' })
})

test('ignores empty and too-short card searches without dropping ownership', () => {
    const emptyWhere = buildOperationListWhere('user-1', new URLSearchParams({ cardNumber: ' - ' }))
    const shortWhere = buildOperationListWhere('user-1', new URLSearchParams({ cardNumber: '123' }))

    assert.equal(emptyWhere.userId, 'user-1')
    assert.equal('cardNumber' in emptyWhere, false)
    assert.equal(shortWhere.userId, 'user-1')
    assert.equal('cardNumber' in shortWhere, false)
})
