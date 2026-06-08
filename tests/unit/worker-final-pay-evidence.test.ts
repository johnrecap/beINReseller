import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildFinalPayBalanceEvidence,
    shouldRecordConfirmedProviderSpend,
} from '../../worker/src/lib/final-pay-evidence'

test('keeps package-load balance diagnostic when final-pay before balance is missing', () => {
    const evidence = buildFinalPayBalanceEvidence({
        operationId: 'operation-1',
        beinAccountId: 'bein-1',
        cardNumber: '7500000001',
        packageName: 'Premium',
        packagePrice: 92,
        finalBalanceBefore: undefined,
        finalBalanceAfter: 408,
        diagnosticBalanceBefore: 500,
    })

    assert.equal(evidence.finalBalanceBefore, null)
    assert.equal(evidence.finalBalanceBeforeSource, 'missing')
    assert.equal(evidence.diagnosticBalanceBefore, 500)
    assert.equal(evidence.diagnosticBalanceBeforeSource, 'package_load_diagnostic')
    assert.equal(evidence.confirmedDebitAmount, null)
    assert.equal(shouldRecordConfirmedProviderSpend(evidence), false)
})

test('confirms provider spend only when final-pay before and after balances exist', () => {
    const evidence = buildFinalPayBalanceEvidence({
        operationId: 'operation-2',
        beinAccountId: 'bein-1',
        cardNumber: '7500000002',
        packageName: 'Premium',
        packagePrice: 92,
        finalBalanceBefore: 500,
        finalBalanceAfter: 408,
        diagnosticBalanceBefore: 550,
    })

    assert.equal(evidence.finalBalanceBeforeSource, 'final_pay_ok_page')
    assert.equal(evidence.finalBalanceAfterSource, 'final_pay_result_page')
    assert.equal(evidence.confirmedDebitAmount, 92)
    assert.equal(shouldRecordConfirmedProviderSpend(evidence), true)
})

test('does not confirm provider spend when final-pay after balance is missing', () => {
    const evidence = buildFinalPayBalanceEvidence({
        operationId: 'operation-3',
        beinAccountId: 'bein-1',
        cardNumber: '7500000003',
        packageName: 'Premium',
        packagePrice: 92,
        finalBalanceBefore: 500,
        finalBalanceAfter: undefined,
        diagnosticBalanceBefore: 500,
    })

    assert.equal(evidence.finalBalanceAfter, null)
    assert.equal(evidence.finalBalanceAfterSource, 'missing')
    assert.equal(evidence.confirmedDebitAmount, null)
    assert.equal(shouldRecordConfirmedProviderSpend(evidence), false)
})
