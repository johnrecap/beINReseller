import test from 'node:test'
import assert from 'node:assert/strict'
import {
    CONFIRMATION_TIMEOUT_SECONDS,
    HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_STALE_SECONDS,
    OPERATION_WARNING_THRESHOLD_SECONDS,
    PACKAGE_SELECTION_TIMEOUT_SECONDS,
} from '@/lib/operations/timing'
import {
    planHeartbeatTimeoutAction,
    planRenewalPackageSelection,
} from '@/lib/operations/lock-timeouts'
import { planRenewalFinalConfirmation } from '@/lib/operation-final-confirmation'
import {
    deadlineAfter,
    deadlineBefore,
    finalPayEvidence,
    renewalOperation,
    selectedRenewalPackage,
    TEST_DEALER_PRICE,
    TEST_NOW,
} from '../helpers/operation-lock-timeout-fixtures'

test('T001 exposes the agreed operation timing windows', () => {
    assert.equal(PACKAGE_SELECTION_TIMEOUT_SECONDS, 30)
    assert.equal(CONFIRMATION_TIMEOUT_SECONDS, 10)
    assert.equal(HEARTBEAT_STALE_SECONDS, 5)
    assert.equal(HEARTBEAT_INTERVAL_MS, 2000)
    assert.equal(OPERATION_WARNING_THRESHOLD_SECONDS, 3)
})

test('T004 package selection expires after its deadline without customer deduction', () => {
    const plan = planRenewalPackageSelection({
        operation: renewalOperation({ finalConfirmExpiry: deadlineBefore(1) }),
        selectedPackage: selectedRenewalPackage(),
        userBalance: 500,
        now: TEST_NOW,
    })

    assert.equal(plan.kind, 'expired')
    assert.equal(plan.deductAmount, 0)
    assert.equal(plan.releaseAccountLock, true)
})

test('T004 package selection blocks low balance without deduction', () => {
    const plan = planRenewalPackageSelection({
        operation: renewalOperation({ finalConfirmExpiry: deadlineAfter(PACKAGE_SELECTION_TIMEOUT_SECONDS) }),
        selectedPackage: selectedRenewalPackage(),
        userBalance: TEST_DEALER_PRICE - 1,
        now: TEST_NOW,
    })

    assert.equal(plan.kind, 'insufficient_balance')
    assert.equal(plan.deductAmount, 0)
    assert.equal(plan.releaseAccountLock, false)
})

test('T005 final confirmation rejects an expired 10 second window before deduction', () => {
    const plan = planRenewalFinalConfirmation({
        operation: renewalOperation({
            status: 'AWAITING_FINAL_CONFIRM',
            finalConfirmExpiry: deadlineBefore(1),
            heartbeatExpiry: deadlineAfter(HEARTBEAT_STALE_SECONDS),
        }),
        userBalance: 500,
        dealerPrice: TEST_DEALER_PRICE,
        jobType: 'CONFIRM_PURCHASE',
        now: TEST_NOW,
    })

    assert.equal(plan.kind, 'expired')
    assert.equal(plan.deductAmount, 0)
    assert.equal(plan.createDispatch, false)
})

test('T005 final confirmation deducts once only inside the valid window', () => {
    const plan = planRenewalFinalConfirmation({
        operation: renewalOperation({
            status: 'AWAITING_FINAL_CONFIRM',
            finalConfirmExpiry: deadlineAfter(CONFIRMATION_TIMEOUT_SECONDS),
            heartbeatExpiry: deadlineAfter(HEARTBEAT_STALE_SECONDS),
        }),
        userBalance: 500,
        dealerPrice: TEST_DEALER_PRICE,
        jobType: 'CONFIRM_PURCHASE',
        now: TEST_NOW,
    })

    assert.equal(plan.kind, 'confirm')
    assert.equal(plan.deductAmount, TEST_DEALER_PRICE)
    assert.equal(plan.createDispatch, true)
})

test('T006 stale heartbeat cancels before Pay but sends after-Pay operations to review', () => {
    const beforePay = planHeartbeatTimeoutAction({
        operationStatus: 'AWAITING_PACKAGE',
        operationAmount: 0,
        operationResponseData: renewalOperation().responseData,
    })

    assert.equal(beforePay.action, 'cancel_before_pay')
    assert.equal(beforePay.releaseAccountLock, true)
    assert.equal(beforePay.refundAllowed, false)

    const afterPay = planHeartbeatTimeoutAction({
        operationStatus: 'COMPLETING',
        operationAmount: TEST_DEALER_PRICE,
        operationResponseData: finalPayEvidence(),
    })

    assert.equal(afterPay.action, 'review_after_pay')
    assert.equal(afterPay.releaseAccountLock, true)
    assert.equal(afterPay.refundAllowed, false)
})
