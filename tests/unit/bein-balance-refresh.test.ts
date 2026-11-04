import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balanceRefreshView, validBalanceObservation, type BalanceRefreshRequest } from '../../shared/bein/balance-refresh'

test('balance projection never exposes run ownership or invents a value from a pending request', () => {
    const request: BalanceRefreshRequest = { requestId: 'r', accountId: 'a', state: 'RUNNING', createdAt: 1,
        deadline: 61, expiresAt: 661, runToken: 'private-owner' }
    const view = balanceRefreshView(request)
    assert.equal('runToken' in view, false)
    assert.equal('expiresAt' in view, false)
    assert.equal('balance' in view, false)
    assert.equal(view.requestId, 'r')
})

test('balance observation rejects missing, negative, nonfinite or malformed data', () => {
    for (const balance of [null, undefined, -1, NaN, Infinity, '20']) assert.equal(validBalanceObservation({ balance, updatedAt: new Date().toISOString() }), false)
    assert.equal(validBalanceObservation({ balance: 0, updatedAt: 'not-a-date' }), false)
    assert.equal(validBalanceObservation({ balance: 0, updatedAt: '2026-11-04T00:00:00.000Z' }), true)
})
