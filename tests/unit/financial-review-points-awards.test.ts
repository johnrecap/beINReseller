import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldAwardOperationSpendPointsAfterFinancialReview } from '@/lib/financial-review/point-awards'

test('proof-backed financial review closure awards operation spend points after completion', () => {
    assert.equal(shouldAwardOperationSpendPointsAfterFinancialReview({
        action: 'BEIN_EXECUTED_NO_REFUND',
        nextStatus: 'COMPLETED',
        fulfillmentVerified: true,
    }), true)
})

test('manual no-refund closure without durable fulfillment proof does not award points', () => {
    assert.equal(shouldAwardOperationSpendPointsAfterFinancialReview({
        action: 'BEIN_EXECUTED_NO_REFUND',
        nextStatus: 'COMPLETED',
        fulfillmentVerified: false,
    }), false)
})

test('refund and follow-up financial review decisions do not award operation spend points', () => {
    assert.equal(shouldAwardOperationSpendPointsAfterFinancialReview({
        action: 'REFUND_CUSTOMER',
        nextStatus: 'FAILED',
        fulfillmentVerified: false,
    }), false)

    assert.equal(shouldAwardOperationSpendPointsAfterFinancialReview({
        action: 'KEEP_UNDER_REVIEW',
        nextStatus: 'REVIEW_REQUIRED',
        fulfillmentVerified: false,
    }), false)
})
