import test from 'node:test'
import assert from 'node:assert/strict'
import { hasProvenUnsubmittedPayment, type PrePaymentContext } from '../../shared/operations/renewal-pre-payment'
import { projectRenewalHold } from '../../shared/operations/renewal-hold'
import { classifyFinancialReview } from '../../src/lib/financial-review/capabilities'
import { en } from '../../src/i18n/translations/en'
import { ar } from '../../src/i18n/translations/ar'
import { bn } from '../../src/i18n/translations/bn'

const safe: PrePaymentContext = { status: 'REVIEW_REQUIRED', renewalFlowVersion: 2,
    providerPaymentState: 'NOT_SUBMITTED', fulfillmentState: 'UNVERIFIED', fulfillmentAuthority: 'NONE',
    responseData: { operationPhase: 'FINAL_CONFIRMATION_REQUESTED', providerMutationMayHaveStarted: true, finalPaySubmitted: false } }

test('positive pre-payment evidence and admin capability agree on absent, final, dispatch and sale evidence', () => {
    const context = { ...safe, id: 'synthetic', type: 'RENEW', userId: 'synthetic-user', customerId: null,
        beinAccountId: null, cardNumber: '7000000001', amount: 0, transactions: [],
        chargedBeinSpendLedger: null, fulfillmentProof: null, manualFulfillmentEvidence: null }
    assert.equal(hasProvenUnsubmittedPayment(context), true)
    assert.ok(classifyFinancialReview(context).allowedActions.includes('RESOLVE_PRE_MUTATION'))
    for (const patch of [
        { responseData: {} }, { responseData: { operationPhase: 'UNKNOWN', finalPaySubmitted: false } },
        { providerMutationStartedAt: new Date() }, { providerMutationStage: 'FINAL_OK' },
        { providerPaymentState: 'UNKNOWN' }, { providerPaymentState: 'CHARGED' },
        { fulfillmentState: 'PROOF_CONFLICT' }, { fulfillmentAuthority: 'AUTOMATED_REPORT' },
        { chargedBeinSpendLedger: { id: 'spend' } }, { fulfillmentProof: { id: 'proof' } },
        { dispatches: [{ jobType: 'CONFIRM_PURCHASE', status: 'DISPATCHED', attempts: 1 }] },
        { responseData: { ...safe.responseData as object, finalPayRequestStartedAt: '2026-10-13T12:00:00Z' } },
    ]) {
        assert.equal(hasProvenUnsubmittedPayment({ ...context, ...patch }), false)
        assert.equal(classifyFinancialReview({ ...context, ...patch }).allowedActions.includes('RESOLVE_PRE_MUTATION'), false)
    }
})

test('hold projection exposes only translated stage/reason/update, never raw response or provider identifiers', () => {
    const hold = projectRenewalHold({ ...safe, type: 'RENEW', updatedAt: '2026-10-13T12:00:00Z',
        responseData: { ...safe.responseData as object, cardNumber: '7000000001', stbNumber: 'SECRET_STB',
            promoCode: 'SECRET_PROMO', cookie: 'SECRET_SESSION' } })!
    assert.deepEqual(hold, { blockReason: 'PRE_PAYMENT_REVIEW', stage: 'PRE_PAYMENT', lastCheckedAt: '2026-10-13T12:00:00.000Z' })
    for (const catalog of [ar, en, bn]) {
        assert.deepEqual(Object.keys(catalog.renewalHold.holdReasons).sort(), Object.keys(en.renewalHold.holdReasons).sort())
        assert.ok(catalog.renewalHold.holdReasons[hold.blockReason])
        assert.ok(catalog.renewalHold.holdStages[hold.stage])
    }
    assert.equal(projectRenewalHold({ ...safe, type: 'RENEW', status: 'FAILED', updatedAt: new Date() }), null)
    assert.equal(projectRenewalHold({ ...safe, type: 'RENEW', status: 'FAILED', updatedAt: new Date(),
        cardLifecycleReservation: { releasedAt: null } })?.blockReason, 'RESERVATION_REMAINS')
})
