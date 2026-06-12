import test from 'node:test'
import assert from 'node:assert/strict'
import {
    USER_BALANCE_SUMMARY_ROLES,
    buildUserBalanceSummaryWhere,
    formatUserBalanceSummary,
} from '@/lib/admin/user-balance-summary'

test('builds the user balance summary filter for non-deleted users, agents, and managers only', () => {
    const where = buildUserBalanceSummaryWhere()

    assert.deepEqual(where, {
        deletedAt: null,
        role: { in: ['USER', 'AGENT', 'MANAGER'] },
    })
    assert.equal((USER_BALANCE_SUMMARY_ROLES as readonly string[]).includes('ADMIN'), false)

    where.role.in.push('ADMIN' as never)
    assert.deepEqual(buildUserBalanceSummaryWhere().role.in, ['USER', 'AGENT', 'MANAGER'])
})

test('formats loaded finite balances without false zeroes', () => {
    assert.equal(formatUserBalanceSummary(null, 'USD'), null)
    assert.equal(formatUserBalanceSummary(undefined, 'USD'), null)
    assert.equal(formatUserBalanceSummary(Number.NaN, 'USD'), null)
    assert.equal(formatUserBalanceSummary(Number.POSITIVE_INFINITY, 'USD'), null)

    assert.equal(formatUserBalanceSummary(0, 'USD'), '0 USD')
    assert.equal(formatUserBalanceSummary(100, 'USD'), '100 USD')
    assert.equal(formatUserBalanceSummary(631.639, 'USD'), '631.64 USD')
    assert.equal(formatUserBalanceSummary(3000, 'USD'), '3,000 USD')
})
