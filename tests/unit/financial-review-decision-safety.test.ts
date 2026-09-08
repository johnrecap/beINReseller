import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    appendManualReviewDecision,
    canRecordFinancialReviewDecisionForStatus,
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
    fulfillmentVerified: false,
    fulfillmentProofId: null,
    fulfillmentAuthority: 'NONE',
    manualEvidenceId: null,
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

test('does not synthesize manual renewal confirmation from no-refund action', () => {
    const manualVerification = normalizeManualVerificationForAction('BEIN_EXECUTED_NO_REFUND')

    assert.equal(manualVerification?.cardRenewed, undefined)
    assert.equal(isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: baseEvidence,
        manualVerification,
    }).allowed, false)
})

test('does not synthesize no-charge evidence from the refund action', () => {
    const manualVerification = normalizeManualVerificationForAction('REFUND_CUSTOMER')

    assert.equal(manualVerification, null)
    const result = isFinancialReviewDecisionAllowed({
        action: 'REFUND_CUSTOMER',
        evidence: baseEvidence,
        manualVerification,
    })
    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED')
})

test('cardRenewed=true alone cannot complete a renewal review', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: baseEvidence,
        manualVerification: { cardRenewed: true },
    })

    assert.equal(result.allowed, false)
})

test('allows no-refund when a unique automated composite proof exists', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: {
            ...baseEvidence,
            fulfillmentVerified: true,
            fulfillmentProofId: 'proof-1',
            fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
        },
    })

    assert.equal(result.allowed, true)
})

test('allows no-refund only with complete structured manual provider evidence', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: baseEvidence,
        manualFulfillmentEvidence: {
            invoiceNo: '53005727',
            cardNumber: '7517687161',
            packageName: 'Add Premium 12 Months',
            providerAmount: '174.00',
            currency: 'USD',
            evidenceSource: 'SBS_INVOICE_DETAILS',
            evidenceNote: 'Invoice and active contract checked in SBS.',
            observedAt: '2026-08-24T12:00:00.000Z',
        },
    })

    assert.equal(result.allowed, true)
})

test('rejects incomplete manual provider evidence', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: baseEvidence,
        manualFulfillmentEvidence: {
            invoiceNo: '53005727',
            cardNumber: '7517687161',
            packageName: '',
            providerAmount: '174.00',
            currency: 'USD',
            evidenceSource: 'SBS_INVOICE_DETAILS',
            evidenceNote: 'Invoice checked.',
            observedAt: '2026-08-24T12:00:00.000Z',
        },
    })

    assert.equal(result.allowed, false)
})

test('does not accept a fulfillment proof from a different beIN account', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'financial-review', 'evidence.ts'), 'utf8')

    assert.match(source, /operation\.fulfillmentProof\.beinAccountId === operation\.beinAccount\.id/)
})

test('admin decision route delegates structured manual completion to one atomic finalizer', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'admin', 'financial-review', '[operationId]', 'decision', 'route.ts'),
        'utf8'
    )

    assert.match(source, /finalizeManualRenewalFulfillment/)
    assert.match(source, /manualFulfillmentEvidence/)
    assert.match(source, /hasAutomatedCompositeProof/)
    assert.match(source, /SOLD_REPORT_CONTRACT_CORRELATION/)
    assert.doesNotMatch(source, /cardRenewed\s*===\s*true[\s\S]{0,600}status:\s*OperationStatus\.COMPLETED/)
})

test('does not allow no-refund from provider charge evidence alone', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'BEIN_EXECUTED_NO_REFUND',
        evidence: {
            ...baseEvidence,
            providerEvidenceState: 'confirmed-final-pay',
            beinDebitConfirmed: true,
            beinDebitAmount: 92,
            beinDebitSource: 'audit_snapshot',
        },
    })

    assert.equal(result.allowed, false)
})

test('manual no-renewal flags cannot replace a terminal no-charge verification', () => {
    const result = isFinancialReviewDecisionAllowed({
        action: 'REFUND_CUSTOMER',
        evidence: baseEvidence,
        manualVerification: { cardRenewed: false },
    })

    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED')
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

test('allows recording no-refund admin decision for an already completed operation', () => {
    assert.equal(canRecordFinancialReviewDecisionForStatus({
        operationStatus: 'COMPLETED',
        action: 'BEIN_EXECUTED_NO_REFUND',
    }), true)
})

test('does not allow refund decisions on already completed operations', () => {
    assert.equal(canRecordFinancialReviewDecisionForStatus({
        operationStatus: 'COMPLETED',
        action: 'REFUND_CUSTOMER',
    }), false)
})

test('admin refund delegates to the strict atomic no-charge finalizer', () => {
    const routeSource = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'admin', 'financial-review', '[operationId]', 'decision', 'route.ts'),
        'utf8'
    )
    const finalizerSource = readFileSync(
        join(process.cwd(), 'src', 'lib', 'operations', 'financial-review-refund-finalization.ts'),
        'utf8'
    )

    assert.match(routeSource, /finalizeStrictFinancialReviewRefund/)
    assert.doesNotMatch(routeSource, /applyAdminRefund/)
    assert.doesNotMatch(routeSource, /providerPaymentState:\s*'NOT_CHARGED'/)
    assert.match(finalizerSource, /fulfillmentVerificationOutcome === 'VALID_NO_MATCH'/)
    assert.match(finalizerSource, /createOperationPointReversalsInTransaction/)
    assert.match(finalizerSource, /operationIntegrityIssue\.updateMany/)
    assert.match(finalizerSource, /type: 'OPERATION_DEDUCT'/)
    assert.match(finalizerSource, /type: 'DEBIT'/)
    assert.match(finalizerSource, /CANONICAL_SETTLEMENT_REQUIRED/)
    assert.match(finalizerSource, /operation\.storeSubscription \|\| customerProviderPayments\.length > 0/)
    assert.doesNotMatch(finalizerSource, /increment: operation\.amount/)
})

test('manual completion cannot promote an unsubmitted or unmarked provider mutation', () => {
    const routeSource = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'admin', 'financial-review', '[operationId]', 'decision', 'route.ts'),
        'utf8'
    )
    const finalizerSource = readFileSync(
        join(process.cwd(), 'src', 'lib', 'operations', 'manual-fulfillment-finalization.ts'),
        'utf8'
    )

    assert.match(routeSource, /classifyFinancialReview\(operationState\)/)
    assert.match(routeSource, /allowedActions\.includes\('BEIN_EXECUTED_NO_REFUND'\)/)
    assert.doesNotMatch(routeSource, /providerPaymentState:[\s\S]{0,220}'NOT_CHARGED'/)
    assert.match(finalizerSource, /operation\.type !== 'RENEW'/)
    assert.match(finalizerSource, /operation\.providerMutationStage !== 'FINAL_OK'/)
    assert.match(finalizerSource, /evidenceWithinMutationWindow/)
    assert.match(finalizerSource, /operation\.providerPaymentState !== input\.providerPaymentState/)
})
