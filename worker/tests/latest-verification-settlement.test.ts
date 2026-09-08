import test from 'node:test'
import assert from 'node:assert/strict'
import { isRefundSettlementVeto } from '../../shared/operations/audit-financial-context'
test('negative verification never overrides unresolved refund settlement', () => {
    for (const state of ['REQUESTED', 'UNKNOWN', 'COMPLETED', 'FAILED', 'CANCELLED']) {
        assert.equal(isRefundSettlementVeto({ state }), true)
    }
    assert.equal(isRefundSettlementVeto(null), false)
})
