import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBalancePreEffectRejection } from '../../src/lib/panel-balance-rejection'

test('balance retry requires a known pre-write or rolled-back endpoint error', () => {
    for (const [status, error] of [[400, 'Invalid data'], [400, 'Insufficient balance'], [404, 'User not found'],
        [400, 'Insufficient balance. Your current balance: $1.00'], [403, 'Manager account is not available']] as const) {
        assert.equal(isBalancePreEffectRejection(new Response(null, { status }), { error }), true)
    }
    for (const [status, body] of [[500, { error: 'Invalid data' }], [400, { error: 'Synthetic rejection' }],
        [200, { error: 'Insufficient balance' }], [400, null], [409, { success: false }]] as const) {
        assert.equal(isBalancePreEffectRejection(new Response(null, { status }), body), false)
    }
})
