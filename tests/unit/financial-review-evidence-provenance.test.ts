import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialReviewItem } from '@/lib/financial-review/evidence'
import type { FinancialReviewDecision, FinancialReviewItem } from '@/lib/financial-review/types'

const CUSTOMER_DEDUCT = 92
const REVIEW_DATE = new Date('2026-06-04T08:00:00.000Z')

type ReviewOperation = Parameters<typeof buildFinancialReviewItem>[0]

function operation(overrides: Partial<ReviewOperation> = {}): ReviewOperation {
    return {
        id: 'operation-review-provenance',
        type: 'RENEW',
        cardNumber: '7500000001',
        amount: CUSTOMER_DEDUCT,
        status: 'REVIEW_REQUIRED',
        createdAt: REVIEW_DATE,
        updatedAt: REVIEW_DATE,
        responseMessage: 'Final payment needs review',
        responseData: {
            auditSnapshot: {
                refundBlocked: true,
                userDeductTotal: CUSTOMER_DEDUCT,
                reviewReason: 'Provider result needs review',
                capturedAt: REVIEW_DATE.toISOString(),
            },
        },
        selectedPackage: { name: 'Premium', price: CUSTOMER_DEDUCT },
        user: { id: 'user-1', username: 'reseller-1' },
        customer: null,
        beinAccount: { id: 'bein-1', username: 'dealer-1', label: 'Main dealer' },
        chargedBeinSpendLedger: null,
        transactions: [{ type: 'OPERATION_DEDUCT', amount: CUSTOMER_DEDUCT }],
        ...overrides,
    }
}

function buildItem(overrides: Partial<ReviewOperation> = {}): FinancialReviewItem {
    const item = buildFinancialReviewItem(operation(overrides), new Map())
    assert.ok(item, 'expected operation to remain in financial review')
    return item
}

function manualDecision(overrides: Partial<FinancialReviewDecision>): FinancialReviewDecision {
    return {
        action: 'KEEP_UNDER_REVIEW',
        note: '',
        decidedBy: 'admin-1',
        decidedByUsername: 'admin',
        decidedAt: REVIEW_DATE.toISOString(),
        ...overrides,
    }
}

test('shows confirmed final-pay beIN debit when both final balances have final-pay provenance', () => {
    const item = buildItem({
        responseData: {
            auditSnapshot: {
                userDeductTotal: CUSTOMER_DEDUCT,
                beinBalanceBefore: 500,
                beinBalanceAfter: 408,
                beinDelta: 92,
                beinBalanceBeforeSource: 'final_pay_ok_page',
                beinBalanceAfterSource: 'final_pay_result_page',
                capturedAt: REVIEW_DATE.toISOString(),
            },
        },
    })

    assert.equal(item.evidence.providerEvidenceState, 'confirmed-final-pay')
    assert.equal(item.evidence.beinDebitConfirmed, true)
    assert.equal(item.evidence.beinDebitAmount, CUSTOMER_DEDUCT)
    assert.equal(item.evidence.differenceAmount, 0)
})

test('does not promote package-load diagnostic balance to confirmed beIN debit', () => {
    const item = buildItem({
        responseData: {
            dealerBalanceBefore: 500,
            dealerBalanceBeforeSource: 'package_load_diagnostic',
            dealerBalanceAfter: 408,
            dealerBalanceAfterSource: 'final_pay_result_page',
            auditSnapshot: {
                userDeductTotal: CUSTOMER_DEDUCT,
                beinBalanceAfter: 408,
                beinBalanceAfterSource: 'final_pay_result_page',
                capturedAt: REVIEW_DATE.toISOString(),
            },
        },
    })

    assert.equal(item.evidence.providerEvidenceState, 'incomplete-evidence')
    assert.equal(item.evidence.beinDebitConfirmed, false)
    assert.equal(item.evidence.beinDebitAmount, null)
    assert.equal(item.evidence.differenceAmount, null)
})

test('marks inflated legacy ledger debit as legacy-unverified and preserves old amount', () => {
    const item = buildItem({
        amount: 82.5,
        responseData: {
            auditSnapshot: {
                userDeductTotal: 82.5,
                capturedAt: REVIEW_DATE.toISOString(),
            },
        },
        chargedBeinSpendLedger: {
            id: 'ledger-legacy',
            beinAccountId: 'bein-1',
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 403.01,
            spendAmount: 96.99,
            evidenceConfidence: 'CONFIRMED',
            beinUsernameSnapshot: 'dealer-1',
            beinLabelSnapshot: 'Main dealer',
        },
        transactions: [{ type: 'OPERATION_DEDUCT', amount: 82.5 }],
    })

    assert.equal(item.evidence.providerEvidenceState, 'legacy-unverified')
    assert.equal(item.evidence.beinDebitConfirmed, false)
    assert.equal(item.evidence.beinDebitAmount, null)
    assert.equal(item.evidence.legacyStoredBeinDebitAmount, 96.99)
})

test('uses manual verified paid decision as admin conclusion without hiding provenance', () => {
    const decision = manualDecision({
        action: 'KEEP_UNDER_REVIEW',
        paymentStatus: 'تم تأكيد الدفع',
        cardRenewed: true,
        actualBeinDebitAmount: 92,
        source: 'admin_manual_review',
    })
    const item = buildItem({
        responseData: {
            auditSnapshot: { userDeductTotal: CUSTOMER_DEDUCT },
            financialReview: {
                latestDecision: decision,
                decisions: [decision],
            },
        },
    })

    assert.equal(item.evidence.providerEvidenceState, 'manual-verified-paid')
    assert.equal(item.evidence.beinDebitConfirmed, true)
    assert.equal(item.evidence.beinDebitAmount, 92)
    assert.equal(item.evidence.manualVerification?.paymentStatus, 'تم تأكيد الدفع')
})

test('uses manual verified not-paid decision as admin conclusion', () => {
    const decision = manualDecision({
        action: 'REFUND_CUSTOMER',
        paymentStatus: 'لم يتم تأكيد الدفع',
        cardRenewed: false,
        source: 'admin_manual_review',
        refundApplied: true,
    })
    const item = buildItem({
        responseData: {
            auditSnapshot: { userDeductTotal: CUSTOMER_DEDUCT },
            financialReview: {
                latestDecision: decision,
                decisions: [decision],
            },
        },
    })

    assert.equal(item.evidence.providerEvidenceState, 'manual-verified-not-paid')
    assert.equal(item.evidence.beinDebitConfirmed, false)
    assert.equal(item.evidence.beinDebitAmount, null)
    assert.equal(item.evidence.manualVerification?.paymentStatus, 'لم يتم تأكيد الدفع')
})
