import test from 'node:test'
import assert from 'node:assert/strict'
import { projectOperationProgress } from '../../shared/operations/consumer-progress'
import { loadPanelPackages } from '../helpers/promo-dispatch-harness'

test('T043 actual expired package GET has no writable dependency and never invents EXPIRED', async () => {
    const h = loadPanelPackages({ id: 'operation', userId: 'owner', status: 'AWAITING_PACKAGE', finalConfirmExpiry: new Date(0) }, 'owner')
    const res = await h.GET(new Request('http://localhost/api/operations/operation/packages'), { params: Promise.resolve({ id: 'operation' }) })
    const data = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.status, 'AWAITING_PACKAGE')
    assert.equal(data.confirmationExpired, true)
    assert.equal(data.settlementState, 'PENDING')
    assert.equal(data.nextAction, 'VIEW_ACTIVE_OPERATION')
})

test('T043 safe additive projection distinguishes review, payment and actual refund', () => {
    const held = projectOperationProgress({ status: 'REVIEW_REQUIRED', providerPaymentState: 'CHARGED' })
    assert.equal(held.reviewRequired, true)
    assert.equal(held.nextAction, 'CONTACT_ADMIN')
    assert.equal(held.settlementState, 'REVIEW_REQUIRED')
    assert.equal(held.messageKey, 'operations.providerChargedFulfillmentUnderReview')
    assert.equal(projectOperationProgress({ status: 'FAILED' }).settlementState, 'UNCONFIRMED')
    assert.equal(projectOperationProgress({ status: 'FAILED', transactions: [{ type: 'REFUND' }] }).settlementState, 'REFUNDED')
    assert.equal(projectOperationProgress({ status: 'COMPLETED' }).settlementState, 'COMPLETED')
    assert.equal(projectOperationProgress({ status: 'COMPLETING', providerPaymentState: 'CHARGED', fulfillmentState: 'VERIFYING' }).messageKey,
        'operations.providerChargedVerifyingFulfillment')
})

test('T043 expiry keeps authoritative status and gives a read-only pending outcome', () => {
    for (const status of ['AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM']) {
        const result = projectOperationProgress({ status, finalConfirmExpiry: new Date(100) }, new Date(101))
        assert.equal(result.confirmationExpired, true)
        assert.equal(result.nextAction, 'VIEW_ACTIVE_OPERATION')
        assert.equal(result.settlementState, 'PENDING')
        assert.equal(result.messageKey, 'operations.confirmationExpired')
        assert.equal('status' in result, false)
    }
})

test('T043 pending refund overrides terminal display; raw evidence never enters DTO', () => {
    const result = projectOperationProgress({ status: 'FAILED', refundSettlements: [{ state: 'PENDING' }], responseData: { secret: 'private' } })
    assert.equal(result.settlementState, 'REFUND_PENDING')
    assert.equal(result.nextAction, 'CONTACT_ADMIN')
    assert.equal(JSON.stringify(result).includes('private'), false)
    assert.equal(projectOperationProgress({ status: 'REVIEW_REQUIRED' }).messageKey, 'operations.fulfillmentReviewPending')
    assert.equal(projectOperationProgress({ status: 'AWAITING_PACKAGE' }).nextAction, 'CONTINUE')
})

test('T043 actual package GET preserves the pending-refund message over an older review message', async () => {
    const h = loadPanelPackages({ id: 'operation', userId: 'owner', status: 'REVIEW_REQUIRED',
        providerPaymentState: 'CHARGED', refundSettlements: [{ state: 'PENDING' }] }, 'owner')
    const res = await h.GET(new Request('http://localhost/api/operations/operation/packages'), { params: Promise.resolve({ id: 'operation' }) })
    const data = await res.json()
    assert.equal(data.settlementState, 'REFUND_PENDING')
    assert.equal(data.messageKey, 'operations.refundSettlementPending')
})

test('smartcard form failure is localized without claiming a quote change or refund', async () => {
    const h = loadPanelPackages({ id: 'operation', userId: 'owner', status: 'FAILED',
        responseMessage: 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED' }, 'owner')
    const res = await h.GET(new Request('http://localhost/api/operations/operation/packages'), { params: Promise.resolve({ id: 'operation' }) })
    const data = await res.json()
    assert.equal(data.status, 'FAILED')
    assert.equal(data.messageKey, 'operations.providerSmartcardFormUnsupported')
    assert.equal(data.settlementState, 'UNCONFIRMED')
    assert.equal(projectOperationProgress({ status: 'FAILED', responseMessage: 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED',
        refundSettlements: [{ state: 'PENDING' }] }).messageKey, 'operations.refundSettlementPending')
    assert.equal(projectOperationProgress({ status: 'REVIEW_REQUIRED', responseMessage: 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED',
        providerPaymentState: 'CHARGED' }).messageKey, 'operations.providerChargedFulfillmentUnderReview')
})
