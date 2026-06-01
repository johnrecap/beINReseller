import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRecovery } from '@/lib/operations/recovery-classifier'
import {
    RECOVERY_EXPIRED_AT,
    RECOVERY_TEST_NOW,
    finalPaySubmittedPhase,
    preFinalPhase,
    recoveryInput,
} from '../helpers/operation-recovery-fixtures'

const STALE_PROCESSING_AT = new Date('2026-05-24T09:55:00.000Z')

test('expires abandoned package selection with no customer deduction', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'AWAITING_PACKAGE',
        amount: 0,
        finalConfirmExpiry: RECOVERY_EXPIRED_AT,
        now: RECOVERY_TEST_NOW,
        customerDeductTransactionExists: false,
    }))

    assert.equal(result.decision, 'EXPIRE')
    assert.equal(result.financialImpact, 'NONE')
})

test('expires abandoned final confirmation before customer deduction', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'AWAITING_FINAL_CONFIRM',
        amount: 0,
        finalConfirmExpiry: RECOVERY_EXPIRED_AT,
        now: RECOVERY_TEST_NOW,
        customerDeductTransactionExists: false,
    }))

    assert.equal(result.decision, 'EXPIRE')
    assert.equal(result.refundAllowed, false)
})

test('retries completing operation when dispatch is pending before final pay', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        dispatchPending: true,
        responseData: preFinalPhase('DISPATCH_PENDING'),
    }))

    assert.equal(result.decision, 'RETRY_DISPATCH')
    assert.equal(result.reviewRequired, false)
})

test('safe-refunds completing operation when dispatch retries are exhausted before final pay', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        dispatchFailed: true,
        dispatchExhausted: true,
        responseData: preFinalPhase('DISPATCH_FAILED'),
    }))

    assert.equal(result.decision, 'SAFE_REFUND')
    assert.equal(result.refundAllowed, true)
    assert.equal(result.reviewRequired, false)
})

test('moves completing operation to review when final pay evidence is incomplete', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        responseData: finalPaySubmittedPhase(),
        heartbeatExpiry: RECOVERY_EXPIRED_AT,
        now: RECOVERY_TEST_NOW,
    }))

    assert.equal(result.decision, 'REVIEW_REQUIRED')
    assert.equal(result.reviewRequired, true)
})

test('completes recovery when provider charge evidence is confirmed', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        responseData: {
            ...finalPaySubmittedPhase(),
            outcomeCategory: 'CONFIRMED_SUCCESS',
        },
    }))

    assert.equal(result.decision, 'COMPLETE')
    assert.equal(result.financialImpact, 'PROVIDER_CHARGED')
    assert.equal(result.reviewRequired, false)
})

test('safe-refunds recovery when provider no-charge evidence is confirmed', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'COMPLETING',
        amount: 92,
        customerDeductTransactionExists: true,
        responseData: {
            ...finalPaySubmittedPhase(),
            outcomeCategory: 'CONFIRMED_NOT_CHARGED',
        },
    }))

    assert.equal(result.decision, 'SAFE_REFUND')
    assert.equal(result.refundAllowed, true)
    assert.equal(result.reviewRequired, false)
})

test('expires stale processing operation with no customer deduction', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'PROCESSING',
        amount: 0,
        customerDeductTransactionExists: false,
        updatedAt: STALE_PROCESSING_AT,
        now: RECOVERY_TEST_NOW,
    }))

    assert.equal(result.decision, 'EXPIRE')
    assert.equal(result.financialImpact, 'NONE')
    assert.equal(result.reviewRequired, false)
})

test('safe-refunds stale processing operation with deduction before final pay', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'PROCESSING',
        amount: 92,
        customerDeductTransactionExists: true,
        responseData: preFinalPhase('CUSTOMER_DEDUCTED'),
        updatedAt: STALE_PROCESSING_AT,
        now: RECOVERY_TEST_NOW,
    }))

    assert.equal(result.decision, 'SAFE_REFUND')
    assert.equal(result.refundAllowed, true)
    assert.equal(result.financialImpact, 'CUSTOMER_DEDUCTED')
})

test('moves stale processing operation to review when final pay may have started', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'PROCESSING',
        amount: 92,
        customerDeductTransactionExists: true,
        responseData: finalPaySubmittedPhase(),
        updatedAt: STALE_PROCESSING_AT,
        now: RECOVERY_TEST_NOW,
    }))

    assert.equal(result.decision, 'REVIEW_REQUIRED')
    assert.equal(result.reviewRequired, true)
    assert.equal(result.financialImpact, 'UNCERTAIN')
})

test('moves stale processing operation with legacy deduction evidence to review', () => {
    const result = classifyRecovery(recoveryInput({
        status: 'PROCESSING',
        amount: 92,
        customerDeductTransactionExists: true,
        updatedAt: STALE_PROCESSING_AT,
        now: RECOVERY_TEST_NOW,
    }))

    assert.equal(result.decision, 'REVIEW_REQUIRED')
    assert.equal(result.reviewRequired, true)
    assert.equal(result.refundAllowed, false)
})
