import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildRenewalFinalConfirmationEvidence,
    planRenewalFinalConfirmation,
    shouldWorkerSubmitRenewalFinalPay,
} from '@/lib/operation-final-confirmation'
import { decideRefundSafety, hasFinalPayStarted } from '@/lib/operation-safety'
import {
    buildFinancialReviewItem,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'
import type { FinancialReviewDecision } from '@/lib/financial-review/types'

const REVIEWED_AT = '2026-06-01T09:00:00.000Z'
const RESELLER_DEDUCTED_AMOUNT = 92
const STALE_DEADLINE = new Date('2026-06-01T08:00:00.000Z')
const VALID_CONFIRM_DEADLINE = new Date('2026-06-01T09:00:10.000Z')
const FINAL_CONFIRM_NOW = new Date('2026-06-01T09:00:00.000Z')

function finalPaySubmittedEvidence(jobType: 'CONFIRM_PURCHASE' | 'CONFIRM_INSTALLMENT') {
    return {
        operationPhase: 'FINAL_PAY_SUBMITTED',
        finalPaySubmitted: true,
        finalPaySubmittedAt: '2026-06-01T08:58:00.000Z',
        jobType,
        dealerBalanceBefore: 500,
        expectedCost: RESELLER_DEDUCTED_AMOUNT,
    }
}

function decision(action: FinancialReviewDecision['action'], note: string, refundApplied?: boolean): FinancialReviewDecision {
    return {
        action,
        note,
        decidedBy: 'admin-1',
        decidedByUsername: 'admin',
        decidedAt: REVIEWED_AT,
        ...(typeof refundApplied === 'boolean' ? { refundApplied } : {}),
    }
}

function withDecision(responseData: unknown, nextDecision: FinancialReviewDecision) {
    return withFinancialReviewMetadata(responseData, (current) => ({
        ...current,
        latestDecision: nextDecision,
        decisions: [...(current.decisions || []), nextDecision],
    }))
}

type ReviewOperation = Parameters<typeof buildFinancialReviewItem>[0]

function resellerReviewOperation(overrides: Partial<ReviewOperation> = {}): ReviewOperation {
    return {
        id: 'operation-review-1',
        type: 'RENEW',
        cardNumber: '1234567890',
        amount: RESELLER_DEDUCTED_AMOUNT,
        status: 'REVIEW_REQUIRED',
        createdAt: new Date('2026-06-01T08:55:00.000Z'),
        updatedAt: new Date('2026-06-01T08:59:00.000Z'),
        responseMessage: 'Final payment outcome requires review',
        responseData: {
            ...finalPaySubmittedEvidence('CONFIRM_PURCHASE'),
            auditSnapshot: {
                refundBlocked: true,
                userDeductTotal: RESELLER_DEDUCTED_AMOUNT,
                reviewReason: 'Provider outcome was ambiguous after final Pay.',
                outcomeCategory: 'UNCERTAIN_REVIEW_REQUIRED',
                capturedAt: '2026-06-01T08:59:00.000Z',
            },
        },
        selectedPackage: { name: 'Sports', price: RESELLER_DEDUCTED_AMOUNT },
        user: { id: 'user-1', username: 'reseller-1' },
        customer: null,
        beinAccount: { id: 'bein-1', username: 'dealer-1', label: 'Main dealer' },
        chargedBeinSpendLedger: null,
        transactions: [{ type: 'OPERATION_DEDUCT', amount: RESELLER_DEDUCTED_AMOUNT }],
        ...overrides,
    }
}

test('T009 renewal final confirmation deducts once and clears stale waiting timers', () => {
    const plan = planRenewalFinalConfirmation({
        operation: {
            id: 'operation-renewal-1',
            status: 'AWAITING_FINAL_CONFIRM',
            amount: 0,
            responseData: { savedAt: '2026-06-01T08:50:00.000Z' },
            finalConfirmExpiry: VALID_CONFIRM_DEADLINE,
            heartbeatExpiry: STALE_DEADLINE,
        },
        userBalance: 150,
        dealerPrice: RESELLER_DEDUCTED_AMOUNT,
        jobType: 'CONFIRM_PURCHASE',
        now: FINAL_CONFIRM_NOW,
    })

    assert.equal(plan.kind, 'confirm')
    assert.equal(plan.deductAmount, RESELLER_DEDUCTED_AMOUNT)
    assert.equal(plan.createDispatch, true)
    assert.equal(plan.operationUpdate.status, 'COMPLETING')
    assert.equal(plan.operationUpdate.amount, RESELLER_DEDUCTED_AMOUNT)
    assert.equal(plan.operationUpdate.finalConfirmExpiry, null)
    assert.equal(plan.operationUpdate.heartbeatExpiry, null)
    assert.equal(plan.operationUpdate.responseData.operationPhase, 'DISPATCH_PENDING')
    assert.equal(plan.operationUpdate.responseData.finalPaySubmitted, false)
})

test('T009 duplicate renewal final confirmation creates no second deduction or dispatch', () => {
    const plan = planRenewalFinalConfirmation({
        operation: {
            id: 'operation-renewal-duplicate',
            status: 'COMPLETING',
            amount: RESELLER_DEDUCTED_AMOUNT,
            responseData: buildRenewalFinalConfirmationEvidence({}, 'CONFIRM_PURCHASE'),
            finalConfirmExpiry: null,
            heartbeatExpiry: null,
        },
        userBalance: 150,
        dealerPrice: RESELLER_DEDUCTED_AMOUNT,
        jobType: 'CONFIRM_PURCHASE',
    })

    assert.equal(plan.kind, 'duplicate')
    assert.equal(plan.deductAmount, 0)
    assert.equal(plan.createDispatch, false)
})

test('T009 insufficient balance leaves renewal final confirmation retryable with no deduction', () => {
    const plan = planRenewalFinalConfirmation({
        operation: {
            id: 'operation-renewal-insufficient',
            status: 'AWAITING_FINAL_CONFIRM',
            amount: 0,
            responseData: { savedAt: '2026-06-01T08:50:00.000Z' },
            finalConfirmExpiry: VALID_CONFIRM_DEADLINE,
            heartbeatExpiry: STALE_DEADLINE,
        },
        userBalance: 50,
        dealerPrice: RESELLER_DEDUCTED_AMOUNT,
        jobType: 'CONFIRM_PURCHASE',
        now: FINAL_CONFIRM_NOW,
    })

    assert.equal(plan.kind, 'insufficient_balance')
    assert.equal(plan.deductAmount, 0)
    assert.equal(plan.createDispatch, false)
    assert.equal(plan.operationUpdate.status, 'AWAITING_FINAL_CONFIRM')
    assert.equal(plan.operationUpdate.amount, 0)
})

test('T009 worker pre-Pay renewal re-check rejects terminal and stale-disallowed operations', () => {
    assert.equal(shouldWorkerSubmitRenewalFinalPay({
        status: 'COMPLETING',
        amount: RESELLER_DEDUCTED_AMOUNT,
        responseData: buildRenewalFinalConfirmationEvidence({}, 'CONFIRM_PURCHASE'),
    }).allowed, true)

    assert.equal(shouldWorkerSubmitRenewalFinalPay({
        status: 'COMPLETED',
        amount: RESELLER_DEDUCTED_AMOUNT,
        responseData: buildRenewalFinalConfirmationEvidence({}, 'CONFIRM_PURCHASE'),
    }).allowed, false)

    assert.equal(shouldWorkerSubmitRenewalFinalPay({
        status: 'COMPLETING',
        amount: 0,
        responseData: { operationPhase: 'DISPATCH_PENDING', finalPaySubmitted: false },
    }).allowed, false)
})

test('T022 allows confirmed no-charge installment reseller refund once, then blocks duplicates', () => {
    const firstDecision = decideRefundSafety({
        operationId: 'operation-installment-1',
        operationStatus: 'PROCESSING',
        operationAmount: RESELLER_DEDUCTED_AMOUNT,
        operationResponseData: finalPaySubmittedEvidence('CONFIRM_INSTALLMENT'),
        customerDeductTransactionExists: true,
        confirmedNonChargeEvidence: true,
        refundTransactionExists: false,
    })

    assert.equal(firstDecision.refundAllowed, true)
    assert.equal(firstDecision.reviewRequired, false)
    assert.equal(firstDecision.finalPayMayHaveStarted, true)

    const duplicateDecision = decideRefundSafety({
        operationId: 'operation-installment-1',
        operationStatus: 'PROCESSING',
        operationAmount: RESELLER_DEDUCTED_AMOUNT,
        operationResponseData: finalPaySubmittedEvidence('CONFIRM_INSTALLMENT'),
        customerDeductTransactionExists: true,
        confirmedNonChargeEvidence: true,
        refundTransactionExists: true,
    })

    assert.equal(duplicateDecision.refundAllowed, false)
    assert.equal(duplicateDecision.refundAlreadyExists, true)
})

test('T022 blocks auto-refund and requires review for ambiguous installment after-Pay evidence', () => {
    const result = decideRefundSafety({
        operationId: 'operation-installment-ambiguous',
        operationStatus: 'PROCESSING',
        operationAmount: RESELLER_DEDUCTED_AMOUNT,
        operationResponseData: {
            ...finalPaySubmittedEvidence('CONFIRM_INSTALLMENT'),
            outcomeCategory: 'UNCERTAIN_REVIEW_REQUIRED',
        },
        customerDeductTransactionExists: true,
        confirmedNonChargeEvidence: false,
        refundTransactionExists: false,
    })

    assert.equal(result.refundAllowed, false)
    assert.equal(result.reviewRequired, true)
    assert.equal(result.finalPayMayHaveStarted, true)
    assert.equal(result.reason, 'FINAL_PAYMENT_STARTED')
})

test('T018 installment final-pay evidence marks provider payment as started', () => {
    assert.equal(hasFinalPayStarted({
        operationStatus: 'PROCESSING',
        operationAmount: RESELLER_DEDUCTED_AMOUNT,
        operationResponseData: finalPaySubmittedEvidence('CONFIRM_INSTALLMENT'),
    }), true)
})

test('T019 confirmed no-charge installment evidence is the only after-Pay auto-refund path', () => {
    const safeNoCharge = decideRefundSafety({
        operationId: 'operation-installment-no-charge',
        operationStatus: 'PROCESSING',
        operationAmount: RESELLER_DEDUCTED_AMOUNT,
        operationResponseData: {
            ...finalPaySubmittedEvidence('CONFIRM_INSTALLMENT'),
            outcomeCategory: 'CONFIRMED_NOT_CHARGED',
        },
        customerDeductTransactionExists: true,
        confirmedNonChargeEvidence: true,
        refundTransactionExists: false,
    })

    assert.equal(safeNoCharge.refundAllowed, true)
    assert.equal(safeNoCharge.reviewRequired, false)

    const ambiguousAfterPay = decideRefundSafety({
        operationId: 'operation-installment-review',
        operationStatus: 'PROCESSING',
        operationAmount: RESELLER_DEDUCTED_AMOUNT,
        operationResponseData: finalPaySubmittedEvidence('CONFIRM_INSTALLMENT'),
        customerDeductTransactionExists: true,
        confirmedNonChargeEvidence: false,
        refundTransactionExists: false,
    })

    assert.equal(ambiguousAfterPay.refundAllowed, false)
    assert.equal(ambiguousAfterPay.reviewRequired, true)
})

test('T023 charged financial review closure moves to confirmed tab', () => {
    const chargedDecision = decision(
        'BEIN_EXECUTED_NO_REFUND',
        'Dealer balance decreased by the expected amount; close without refund.'
    )
    const responseData = withDecision(resellerReviewOperation().responseData, chargedDecision)
    const item = buildFinancialReviewItem({
        ...resellerReviewOperation({ responseData: responseData as ReviewOperation['responseData'] }),
        chargedBeinSpendLedger: {
            id: 'ledger-1',
            beinAccountId: 'bein-1',
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 408,
            spendAmount: RESELLER_DEDUCTED_AMOUNT,
            evidenceConfidence: 'confirmed',
            beinUsernameSnapshot: 'dealer-1',
            beinLabelSnapshot: 'Main dealer',
        },
    }, new Map())

    assert.ok(item, 'closed charged review should remain visible in its closure tab')
    assert.equal(item.state, 'bein_executed')
})

test('T023 no-charge refund financial review closure moves to refunded tab', () => {
    const refundDecision = decision(
        'REFUND_CUSTOMER',
        'Provider was not charged; reseller refund applied.',
        true
    )
    const responseData = withDecision(resellerReviewOperation().responseData, refundDecision)
    const item = buildFinancialReviewItem({
        ...resellerReviewOperation({ responseData: responseData as ReviewOperation['responseData'] }),
        transactions: [
            { type: 'OPERATION_DEDUCT', amount: RESELLER_DEDUCTED_AMOUNT },
            { type: 'REFUND', amount: RESELLER_DEDUCTED_AMOUNT },
        ],
    }, new Map())

    assert.ok(item, 'closed refunded review should remain visible in its closure tab')
    assert.equal(item.state, 'refunded')
})

test('T023 no-charge financial review refund is not duplicated when reseller refund already exists', () => {
    const result = decideRefundSafety({
        operationId: 'operation-review-refund-duplicate',
        operationStatus: 'PROCESSING',
        operationType: 'RENEW',
        operationAmount: RESELLER_DEDUCTED_AMOUNT,
        operationResponseData: {
            operationPhase: 'POST_FINAL_PAY_REVIEW',
            finalPaySubmitted: true,
            outcomeCategory: 'PROVIDER_NOT_CHARGED',
        },
        customerDeductTransactionExists: true,
        confirmedNonChargeEvidence: true,
        refundTransactionExists: true,
    })

    assert.equal(result.refundAllowed, false)
    assert.equal(result.refundAlreadyExists, true)
})

test('T023 charged financial review closure rejects missing provider charge evidence', () => {
    const chargedDecision = decision(
        'BEIN_EXECUTED_NO_REFUND',
        'Closing as charged without balance or ledger evidence should be rejected.'
    )
    const responseData = withDecision(resellerReviewOperation().responseData, chargedDecision)
    const item = buildFinancialReviewItem({
        ...resellerReviewOperation({ responseData: responseData as ReviewOperation['responseData'] }),
        chargedBeinSpendLedger: null,
    }, new Map())

    assert.ok(item, 'missing evidence should keep the review visible')
    assert.equal(item.evidence.beinDebitConfirmed, false)
    assert.equal(item.state, 'needs_decision')
})
