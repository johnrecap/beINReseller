import test from 'node:test'
import assert from 'node:assert/strict'
import {
    appendManualReviewDecision,
    getDefaultPaymentStatus,
    isFinancialReviewDecisionAllowed,
    normalizeManualVerificationForAction,
} from '@/lib/financial-review/manual-decisions'
import type { FinancialReviewEvidence } from '@/lib/financial-review/types'

const baseEvidence: FinancialReviewEvidence = {
    operationId: 'operation-decision-1',
    reason: 'needs review',
    reasonCode: null,
    refundBlocked: true,
    responseMessage: null,
    userDeductTotal: 92,
    userBalanceBefore: 120,
    userBalanceAfter: 28,
    beinBalanceBefore: null,
    beinBalanceAfter: null,
    beinDelta: null,
    beinUsername: 'dealer-1',
    beinAccountId: 'bein-1',
    beinAccountLabel: 'Main dealer',
    beinDebitConfirmed: false,
    beinDebitAmount: null,
    beinDebitSource: 'none',
    beinLedgerId: null,
    beinEvidenceConfidence: null,
    selectedPackageName: 'Premium',
    selectedPackagePrice: 92,
    capturedAt: null,
    hasUserDeduction: true,
    hasCustomerWalletDebit: false,
    hasRefund: false,
    financiallyImpacted: true,
    providerEvidenceState: 'incomplete-evidence',
    providerEvidenceLabel: 'Incomplete evidence',
    legacyStoredBeinDebitAmount: null,
    differenceAmount: null,
    manualVerification: null,
}

test('adds default payment status for no-refund and refund decisions while preserving history', () => {
    const first = appendManualReviewDecision(
        {},
        {
            action: 'BEIN_EXECUTED_NO_REFUND',
            note: 'checked beIN manually',
            decidedBy: 'admin-1',
            decidedByUsername: 'admin',
            decidedAt: '2026-06-04T08:00:00.000Z',
        }
    )
    const second = appendManualReviewDecision(first, {
        action: 'REFUND_CUSTOMER',
        note: 'later check found no renewal',
        decidedBy: 'admin-2',
        decidedByUsername: 'second-admin',
        decidedAt: '2026-06-04T08:05:00.000Z',
        refundApplied: true,
    })

    assert.equal(first.latestDecision?.paymentStatus, 'تم تأكيد الدفع')
    assert.equal(second.latestDecision?.paymentStatus, 'لم يتم تأكيد الدفع')
    assert.equal(second.decisions?.length, 2)
    assert.equal(second.decisions?.[0]?.note, 'checked beIN manually')
})

test('does not force a payment status for keep-under-review decisions', () => {
    const metadata = appendManualReviewDecision({}, {
        action: 'KEEP_UNDER_REVIEW',
        note: '',
        decidedBy: 'admin-1',
        decidedByUsername: 'admin',
        decidedAt: '2026-06-04T08:00:00.000Z',
    })

    assert.equal(getDefaultPaymentStatus('KEEP_UNDER_REVIEW'), null)
    assert.equal(metadata.latestDecision?.paymentStatus, undefined)
})

test('blocks refund and no-refund for incomplete evidence without manual verification', () => {
    assert.equal(isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: baseEvidence,
    }).allowed, false)

    assert.equal(isFinancialReviewDecisionAllowed({
        action: 'REFUND_CUSTOMER',
        evidence: baseEvidence,
    }).allowed, false)
})

test('normalizes no-refund action into manual paid confirmation even when the old field is absent', () => {
    const manualVerification = normalizeManualVerificationForAction('BEIN_EXECUTED_NO_REFUND')

    assert.equal(manualVerification?.cardRenewed, true)
    assert.equal(manualVerification?.paymentStatus, 'تم تأكيد الدفع')
    assert.equal(isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: baseEvidence,
        manualVerification,
    }).allowed, true)
})

test('normalizes refund action into manual not-paid confirmation even when the old field is absent', () => {
    const manualVerification = normalizeManualVerificationForAction('REFUND_CUSTOMER')

    assert.equal(manualVerification?.cardRenewed, false)
    assert.equal(manualVerification?.paymentStatus, 'لم يتم تأكيد الدفع')
    assert.equal(isFinancialReviewDecisionAllowed({
        action: 'REFUND_CUSTOMER',
        evidence: baseEvidence,
        manualVerification,
    }).allowed, true)
})

test('allows no-refund when manual verification confirms renewal', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: baseEvidence,
        manualVerification: { cardRenewed: true },
    })

    assert.equal(result.allowed, true)
})

test('allows refund when manual verification confirms no renewal and no trusted provider debit exists', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'REFUND_CUSTOMER',
        evidence: baseEvidence,
        manualVerification: { cardRenewed: false },
    })

    assert.equal(result.allowed, true)
})

test('blocks refund when trusted provider debit exists unless escalated outside automatic flow', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'REFUND_CUSTOMER',
        evidence: {
            ...baseEvidence,
            providerEvidenceState: 'confirmed-final-pay',
            beinDebitConfirmed: true,
            beinDebitAmount: 92,
            beinDebitSource: 'audit_snapshot',
        },
        manualVerification: { cardRenewed: false },
    })

    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'PROVIDER_CHARGE_EVIDENCE_CONFLICT')
})
