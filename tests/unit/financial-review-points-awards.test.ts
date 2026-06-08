import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldAwardOperationSpendPointsAfterFinancialReview } from '@/lib/financial-review/point-awards'

test('charged financial review closure awards operation spend points after completion', () => {
    assert.equal(shouldAwardOperationSpendPointsAfterFinancialReview({
        action: 'BEIN_EXECUTED_NO_REFUND',
        nextStatus: 'COMPLETED',
    }), true)
})

test('refund and follow-up financial review decisions do not award operation spend points', () => {
    assert.equal(shouldAwardOperationSpendPointsAfterFinancialReview({
        action: 'REFUND_CUSTOMER',
        nextStatus: 'FAILED',
    }), false)

    assert.equal(shouldAwardOperationSpendPointsAfterFinancialReview({
        action: 'KEEP_UNDER_REVIEW',
        nextStatus: 'REVIEW_REQUIRED',
    }), false)
})
