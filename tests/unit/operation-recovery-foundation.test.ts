import test from 'node:test'
import assert from 'node:assert/strict'
import { getAccountLockReleaseDecision } from '@/lib/operations/account-lock-release'
import { mergeRecoveryEvidence } from '@/lib/operations/recovery-evidence'
import { hasFinalPayStarted } from '@/lib/operation-safety'

test('skips account lock release when expected owner is unknown', () => {
    const result = getAccountLockReleaseDecision('worker-1', null)

    assert.equal(result.released, false)
    assert.equal(result.reason, 'missing_expected_owner')
})

test('allows account lock release only for the matching owner', () => {
    const result = getAccountLockReleaseDecision('worker-1', 'worker-1')

    assert.equal(result.released, true)
    assert.equal(result.reason, 'owner_matched')
})

test('keeps existing response data while adding recovery evidence', () => {
    const responseData = mergeRecoveryEvidence(
        { existing: 'kept', operationPhase: 'DISPATCH_PENDING' },
        {
            source: 'maintenance',
            decision: 'SAFE_REFUND',
            reason: 'dispatch_failed',
            financialImpact: 'CUSTOMER_DEDUCTED',
            at: new Date('2026-05-24T10:10:00.000Z'),
            lockRelease: {
                attempted: true,
                released: false,
                reason: 'missing_expected_owner',
            },
        }
    )

    assert.equal(responseData.existing, 'kept')
    assert.equal(responseData.operationPhase, 'DISPATCH_PENDING')
    assert.deepEqual(responseData.lastRecoveryLockRelease, {
        attempted: true,
        released: false,
        reason: 'missing_expected_owner',
    })
})

test('treats pre-final phases as before final pay', () => {
    assert.equal(hasFinalPayStarted({
        operationStatus: 'PROCESSING',
        operationResponseData: { operationPhase: 'CUSTOMER_DEDUCTED' },
    }), false)
})
