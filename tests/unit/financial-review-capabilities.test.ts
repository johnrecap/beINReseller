import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyFinancialReview, type ReviewCapabilityContext } from '../../src/lib/financial-review/capabilities'

const base: ReviewCapabilityContext = {
    id: 'operation', type: 'RENEW', purpose: 'RENEWAL', status: 'REVIEW_REQUIRED', userId: 'user', customerId: null,
    beinAccountId: 'account', cardNumber: '7100000001', amount: 174, selectedPackage: { name: 'Package', price: 174 },
    providerPaymentState: 'UNKNOWN', providerMutationStartedAt: new Date(), providerMutationStage: 'FINAL_OK',
    fulfillmentAuthority: 'NONE', fulfillmentState: 'UNVERIFIED', transactions: [{ type: 'OPERATION_DEDUCT', amount: -174, userId: 'user' }],
    dispatches: [], refundSettlements: [],
}

for (const [label, patch, classification, action] of [
    ['modern', {}, 'MODERN_RENEWAL', 'BEIN_EXECUTED_NO_REFUND'],
    ['legacy', { purpose: null, providerMutationStartedAt: null, providerMutationStage: null, providerPaymentState: null }, 'LEGACY_RENEWAL', 'BEIN_EXECUTED_NO_REFUND'],
    ['installment', { purpose: 'INSTALLMENT' }, 'INSTALLMENT', undefined],
    ['unknown type', { type: 'SIGNAL_CHECK' }, 'UNSUPPORTED', undefined],
    ['already closed', { status: 'COMPLETED' }, 'CLOSED', undefined],
    ['customer ownership', { customerId: 'customer', userId: null }, 'UNSUPPORTED', undefined],
    ['missing deduction', { transactions: [] }, 'CONFLICT', undefined],
    ['wrong deduction owner', { transactions: [{ type: 'OPERATION_DEDUCT', amount: -174, userId: 'other' }] }, 'CONFLICT', undefined],
    ['duplicate deduction', { transactions: [...base.transactions, ...base.transactions] }, 'CONFLICT', undefined],
    ['mismatched deduction amount', { transactions: [{ type: 'OPERATION_DEDUCT', amount: -1, userId: 'user' }] }, 'CONFLICT', undefined],
    ['nonfinite amount', { amount: NaN }, 'CONFLICT', undefined],
    ['nonfinite deduction', { transactions: [{ type: 'OPERATION_DEDUCT', amount: -Infinity, userId: 'user' }] }, 'CONFLICT', undefined],
    ['pending refund', { refundSettlements: [{ state: 'PENDING' }] }, 'CONFLICT', undefined],
    ['absent time does not mean unsent', { providerMutationStartedAt: null, providerMutationStage: null }, 'LEGACY_RENEWAL', 'BEIN_EXECUTED_NO_REFUND'],
] as const) {
    test(`T024 review capabilities: ${label}`, () => {
        const result = classifyFinancialReview({ ...base, ...patch } as ReviewCapabilityContext)
        assert.equal(result.classification, classification)
        assert.equal(result.allowedActions.includes('BEIN_EXECUTED_NO_REFUND'), action === 'BEIN_EXECUTED_NO_REFUND')
        assert.equal(result.allowedActions.includes('REFUND_CUSTOMER'), false)
    })
}

test('T024 affirmative non-submission permits resolution only while final dispatch is fenced unsent', () => {
    const input = { ...base, providerMutationStartedAt: null, providerMutationStage: null,
        providerPaymentState: 'NOT_SUBMITTED', responseData: { operationPhase: 'PACKAGE_PREPARATION', finalPaySubmitted: false } }
    assert.ok(classifyFinancialReview(input).allowedActions.includes('RESOLVE_PRE_MUTATION'))
    for (const status of ['DISPATCHING', 'DISPATCHED', 'REVIEW_REQUIRED']) {
        const result = classifyFinancialReview({ ...input, dispatches: [{ jobType: 'CONFIRM_PURCHASE', status, attempts: 1 }] })
        assert.equal(result.allowedActions.includes('RESOLVE_PRE_MUTATION'), false)
    }
})

test('v2 selection preparation with no debit can be resolved only without final mutation or proof', () => {
    const input = { ...base, renewalFlowVersion: 2, amount: 0, transactions: [],
        providerMutationStartedAt: null, providerMutationStage: null,
        providerPaymentState: 'NOT_SUBMITTED', responseData: {
            operationPhase: 'PROVIDER_SALE_PREPARATION_STARTED',
            providerMutationMayHaveStarted: true, finalPaySubmitted: false,
        } }
    assert.ok(classifyFinancialReview(input).allowedActions.includes('RESOLVE_PRE_MUTATION'))
    assert.ok(classifyFinancialReview({ ...input, responseData: {
        operationPhase: 'FINAL_CONFIRMATION_REQUESTED',
        providerMutationMayHaveStarted: true, finalPaySubmitted: false,
    } }).allowedActions.includes('RESOLVE_PRE_MUTATION'))
    assert.equal(classifyFinancialReview({ ...input, renewalFlowVersion: 1 })
        .allowedActions.includes('RESOLVE_PRE_MUTATION'), false)
    assert.equal(classifyFinancialReview({ ...input, responseData: {
        operationPhase: 'FINAL_CONFIRMATION_REQUESTED',
        providerMutationMayHaveStarted: true, finalPaySubmitted: false,
        finalPayRequestStartedAt: '2026-10-13T01:00:01Z',
    } }).allowedActions.includes('RESOLVE_PRE_MUTATION'), false)
    assert.equal(classifyFinancialReview({ ...input, providerMutationStartedAt: new Date() })
        .allowedActions.includes('RESOLVE_PRE_MUTATION'), false)
    assert.equal(classifyFinancialReview({ ...input, chargedBeinSpendLedger: { id: 'spend' } })
        .allowedActions.includes('RESOLVE_PRE_MUTATION'), false)
})

test('T024 legacy post-attempt refund remains held without attributable rejection and independent non-execution', () => {
    const result = classifyFinancialReview({ ...base, providerMutationStartedAt: null, providerMutationStage: null,
        providerPaymentState: 'NOT_CHARGED', fulfillmentState: 'NOT_FOUND' })
    assert.equal(result.allowedActions.includes('REFUND_CUSTOMER'), false)
    assert.ok(result.blockedReasonCodes.includes('LEGACY_NONEXECUTION_EVIDENCE_REQUIRED'))
})
