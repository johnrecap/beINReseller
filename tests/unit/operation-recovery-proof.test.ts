import test from 'node:test'
import assert from 'node:assert/strict'
import {
    getRecoveryProviderBalanceRepairEvidence,
    hasRecoveryProviderCompletionProof,
} from '@/lib/operations/recovery-proof'

const ledger = {
    id: 'ledger-1',
    beinAccountId: 'bein-1',
    spendAmount: 92,
    dealerBalanceBefore: 500,
    dealerBalanceAfter: 408,
    evidenceConfidence: 'CONFIRMED_FINAL_PAY',
}

const auditResponseData = {
    operationPhase: 'FINAL_PAY_SUBMITTED',
    finalPaySubmitted: true,
    outcomeCategory: 'CONFIRMED_SUCCESS',
    auditSnapshot: {
        providerEvidenceState: 'confirmed-final-pay',
        outcomeCategory: 'CONFIRMED_SUCCESS',
        chargedBeinLedgerId: 'ledger-1',
        beinAccountId: 'bein-1',
        beinBalanceBefore: 500,
        beinBalanceAfter: 408,
        beinDelta: 92,
        beinBalanceBeforeSource: 'final_pay_ok_page',
        beinBalanceAfterSource: 'final_pay_balance_check',
    },
}

test('accepts recovery completion proof only when confirmed ledger and audit snapshot match', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: auditResponseData,
        chargedBeinSpendLedger: ledger,
    }), true)
})

test('rejects recovery completion proof without matching audit and ledger evidence', () => {
    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: auditResponseData,
        chargedBeinSpendLedger: null,
    }), false)

    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: {
            ...auditResponseData,
            auditSnapshot: {
                ...auditResponseData.auditSnapshot,
                chargedBeinLedgerId: 'different-ledger',
            },
        },
        chargedBeinSpendLedger: ledger,
    }), false)

    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: {
            ...auditResponseData,
            auditSnapshot: {
                ...auditResponseData.auditSnapshot,
                beinDelta: 50,
            },
        },
        chargedBeinSpendLedger: ledger,
    }), false)

    assert.equal(hasRecoveryProviderCompletionProof({
        responseData: auditResponseData,
        chargedBeinSpendLedger: {
            ...ledger,
            dealerBalanceAfter: 407,
        },
    }), false)
})

const repairResponseData = {
    operationPhase: 'FINAL_PAY_SUBMITTED',
    finalPaySubmitted: true,
    finalPaySubmittedAt: '2026-06-16T02:00:08.000Z',
    dealerBalanceBefore: 1513.01,
    dealerBalanceBeforeSource: 'final_pay_ok_page',
    dealerBalanceAfter: 1411.01,
    dealerBalanceAfterSource: 'final_pay_result_page',
    diagnosticDealerBalanceBefore: 1513.01,
    diagnosticDealerBalanceBeforeSource: 'package_load_diagnostic',
    providerEvidenceState: 'confirmed-final-pay',
    providerEvidenceCapturedAt: '2026-06-16T02:00:09.000Z',
    providerEvidenceContext: {
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7500000001',
        packageName: 'Premium',
        packagePrice: 102,
        contextMatched: true,
    },
    expectedCost: 102,
    outcomeCategory: 'CONFIRMED_SUCCESS',
}

test('extracts recovery repair evidence from confirmed final-pay balance proof', () => {
    const evidence = getRecoveryProviderBalanceRepairEvidence({
        responseData: repairResponseData,
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7500000001',
        expectedCost: 102,
    })

    assert.ok(evidence)
    assert.equal(evidence.beinAccountId, 'bein-1')
    assert.equal(evidence.dealerBalanceBefore, 1513.01)
    assert.equal(evidence.dealerBalanceAfter, 1411.01)
    assert.equal(evidence.spendAmount, 102)
    assert.equal(evidence.dealerBalanceAfterSource, 'final_pay_result_page')
})

test('rejects recovery repair evidence without final-pay balance provenance', () => {
    assert.equal(getRecoveryProviderBalanceRepairEvidence({
        responseData: {
            ...repairResponseData,
            dealerBalanceBeforeSource: 'package_load_diagnostic',
        },
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7500000001',
        expectedCost: 102,
    }), null)
})

test('rejects recovery repair evidence when balance decrease does not match expected cost', () => {
    assert.equal(getRecoveryProviderBalanceRepairEvidence({
        responseData: {
            ...repairResponseData,
            expectedCost: 95,
            providerEvidenceContext: {
                ...repairResponseData.providerEvidenceContext,
                packagePrice: 95,
            },
        },
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7500000001',
        expectedCost: 95,
    }), null)
})

test('rejects recovery repair evidence when provider context does not match operation', () => {
    assert.equal(getRecoveryProviderBalanceRepairEvidence({
        responseData: {
            ...repairResponseData,
            providerEvidenceContext: {
                ...repairResponseData.providerEvidenceContext,
                operationId: 'different-operation',
            },
        },
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7500000001',
        expectedCost: 102,
    }), null)
})
