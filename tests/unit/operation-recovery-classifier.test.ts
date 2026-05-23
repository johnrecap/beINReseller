import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRecovery } from '@/lib/operations/recovery-classifier'

test('expires abandoned package selection with no customer deduction', () => {
    const result = classifyRecovery({
        status: 'AWAITING_PACKAGE',
        amount: 0,
        finalConfirmExpiry: new Date('2026-05-24T10:00:00.000Z'),
        now: new Date('2026-05-24T10:02:00.000Z'),
        customerDeductTransactionExists: false,
    })

    assert.equal(result.decision, 'EXPIRE')
    assert.equal(result.financialImpact, 'NONE')
})

test('expires abandoned final confirmation before customer deduction', () => {
    const result = classifyRecovery({
        status: 'AWAITING_FINAL_CONFIRM',
        amount: 0,
        finalConfirmExpiry: new Date('2026-05-24T10:00:00.000Z'),
        now: new Date('2026-05-24T10:02:00.000Z'),
        customerDeductTransactionExists: false,
    })

    assert.equal(result.decision, 'EXPIRE')
    assert.equal(result.refundAllowed, false)
})

test('retries completing operation when dispatch is pending before final pay', () => {
    const result = classifyRecovery({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        dispatchPending: true,
        responseData: {
            operationPhase: 'DISPATCH_PENDING',
            finalPaySubmitted: false,
        },
    })

    assert.equal(result.decision, 'RETRY_DISPATCH')
    assert.equal(result.reviewRequired, false)
})

test('safe-refunds completing operation when dispatch retries are exhausted before final pay', () => {
    const result = classifyRecovery({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        dispatchFailed: true,
        dispatchExhausted: true,
        responseData: {
            operationPhase: 'DISPATCH_FAILED',
            finalPaySubmitted: false,
        },
    })

    assert.equal(result.decision, 'SAFE_REFUND')
    assert.equal(result.refundAllowed, true)
    assert.equal(result.reviewRequired, false)
})

test('moves completing operation to review when final pay evidence is incomplete', () => {
    const result = classifyRecovery({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        responseData: {
            operationPhase: 'FINAL_PAY_SUBMITTED',
            finalPaySubmitted: true,
        },
        heartbeatExpiry: new Date('2026-05-24T10:00:00.000Z'),
        now: new Date('2026-05-24T10:02:00.000Z'),
    })

    assert.equal(result.decision, 'REVIEW_REQUIRED')
    assert.equal(result.reviewRequired, true)
})
