import test from 'node:test'
import assert from 'node:assert/strict'
import { hasRecoveryProviderCompletionProof } from '@/lib/operations/recovery-proof'

const responseData = {
    operationPhase: 'FINAL_PAY_SUBMITTED',
    finalPaySubmitted: true,
    providerPaymentState: 'CHARGED',
    fulfillmentState: 'VERIFIED',
    fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
}

test('provider balance ledger alone is not recovery completion proof', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData,
        chargedBeinSpendLedger: {
            id: 'ledger-1',
            beinAccountId: 'bein-1',
            spendAmount: 174,
            dealerBalanceBefore: 1000,
            dealerBalanceAfter: 826,
            evidenceConfidence: 'CONFIRMED_FINAL_PAY',
        },
        fulfillmentProof: null,
    }), false)
})

test('installment recovery preserves its prior confirmed provider balance proof', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: {
            operationPhase: 'FINAL_PAY_SUBMITTED',
            finalPaySubmitted: true,
            jobType: 'CONFIRM_INSTALLMENT',
            auditSnapshot: {
                providerEvidenceState: 'confirmed-final-pay',
                outcomeCategory: 'CONFIRMED_SUCCESS',
                chargedBeinLedgerId: 'ledger-installment-1',
                beinAccountId: 'bein-1',
                beinBalanceBefore: 500,
                beinBalanceAfter: 408,
                beinBalanceBeforeSource: 'final_pay_ok_page',
                beinBalanceAfterSource: 'final_pay_result_page',
            },
        },
        chargedBeinSpendLedger: {
            id: 'ledger-installment-1',
            beinAccountId: 'bein-1',
            spendAmount: 92,
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 408,
            evidenceConfidence: 'CONFIRMED_FINAL_PAY',
        },
    }), true)
})

test('ordinary renewal cannot relabel balance evidence as installment proof', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: {
            operationPhase: 'FINAL_PAY_SUBMITTED',
            finalPaySubmitted: true,
            jobType: 'CONFIRM_PURCHASE',
            auditSnapshot: {
                providerEvidenceState: 'confirmed-final-pay',
                outcomeCategory: 'CONFIRMED_SUCCESS',
                chargedBeinLedgerId: 'ledger-renewal-1',
                beinAccountId: 'bein-1',
                beinBalanceBefore: 500,
                beinBalanceAfter: 326,
                beinBalanceBeforeSource: 'final_pay_ok_page',
                beinBalanceAfterSource: 'final_pay_result_page',
            },
        },
        chargedBeinSpendLedger: {
            id: 'ledger-renewal-1',
            beinAccountId: 'bein-1',
            spendAmount: 174,
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 326,
            evidenceConfidence: 'CONFIRMED_FINAL_PAY',
        },
    }), false)
})
test('matching unique fulfillment proof permits recovery completion', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData,
        chargedBeinSpendLedger: null,
        fulfillmentProof: {
            id: 'proof-1',
            operationId: 'operation-1',
            beinAccountId: 'bein-1',
            cardNumberSnapshot: '7517687161',
            invoiceNo: 'INV-1',
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
        },
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7517687161',
    }), true)
})

test('mismatched proof context does not permit recovery completion', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData,
        fulfillmentProof: {
            id: 'proof-1',
            operationId: 'operation-2',
            beinAccountId: 'bein-1',
            cardNumberSnapshot: '7517687161',
            invoiceNo: 'INV-1',
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
        },
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7517687161',
    }), false)
})

test('legacy contract-only proof cannot permit recovery completion', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: {
            ...responseData,
            fulfillmentAuthority: 'NONE',
        },
        fulfillmentProof: {
            id: 'legacy-proof-1',
            operationId: 'operation-1',
            beinAccountId: 'bein-1',
            cardNumberSnapshot: '7517687161',
            invoiceNo: 'INV-LEGACY',
            proofKind: 'LEGACY_CONTRACT_ONLY',
        },
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7517687161',
    }), false)
})

test('structured manual provider evidence permits labeled recovery completion', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: {
            ...responseData,
            fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION',
        },
        fulfillmentProof: null,
        manualFulfillmentEvidence: {
            id: 'manual-evidence-1',
            operationId: 'operation-1',
            beinAccountId: 'bein-1',
            cardNumberSnapshot: '7517687161',
            invoiceNo: 'INV-MANUAL-1',
        },
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7517687161',
    }), true)
})
