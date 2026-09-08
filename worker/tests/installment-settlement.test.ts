import test from 'node:test'
import assert from 'node:assert/strict'
import { decideInstallmentEvidence } from '../../shared/operations/audit-financial-context'
import { installmentIdentity } from '../../shared/operations/audit-financial-context'
import { HttpClientService } from '../src/http/HttpClientService'

const context = { operationId: 'op', beinAccountId: 'account', cardNumber: '1234567890', installmentId: 'due', correlationKey: 'attempt', mutationStartedAt: new Date('2026-09-07T00:00:00Z') }
test('installment debit cannot stand in for settlement; context and receipt are required', () => {
    const evidence = { ...context, observedAt: context.mutationStartedAt, paymentState: 'CHARGED', settlementState: 'UNKNOWN', evidenceVersion: 1, settlementReference: null, rejectionReference: null }
    assert.equal(decideInstallmentEvidence(context, evidence), 'REVIEW_REQUIRED')
    const settled = { ...evidence, settlementState: 'SETTLED', settlementReference: 'receipt' }
    assert.equal(decideInstallmentEvidence(context, settled), 'COMPLETE')
    for (const key of ['operationId', 'beinAccountId', 'cardNumber', 'installmentId', 'correlationKey'] as const) {
        assert.equal(decideInstallmentEvidence(context, { ...settled, [key]: 'different' }), 'REVIEW_REQUIRED')
    }
})
test('installment due identity detects quote/period changes and rejects invalid money', () => {
    const row = { package: 'synthetic', monthsToPay: '1 part', contractStartDate: '01/09/2026', contractExpiryDate: '01/10/2026',
        installment1: 10, installment2: 10, invoicePrice: 10, dealerPrice: 10 }
    assert.ok(installmentIdentity(row))
    assert.notEqual(installmentIdentity(row), installmentIdentity({ ...row, monthsToPay: '2 parts' }))
    for (const dealerPrice of [NaN, Infinity, -1, 0]) assert.equal(installmentIdentity({ ...row, dealerPrice }), null)
})

for (const failAt of [1, 2]) test(`installment HTTP fences mutation POST ${failAt} after lease loss`, async () => {
    let posts = 0, checks = 0
    const fake = {
        config: { installmentUrl: 'https://synthetic.invalid/installment' }, currentViewState: { __VIEWSTATE: 'synthetic' },
        buildFullUrl: (url: string) => url, getCurrentBalance: async () => 1000,
        buildFormData: (data: unknown) => data, buildPostHeaders: () => ({}),
        checkForSessionExpiry: () => null, extractHiddenFields: () => ({ __VIEWSTATE: 'synthetic' }),
        axios: { post: async () => { posts++; return { data: '<input type="radio" name="Epay" id="RbdDirectPay" value="Direct"><input type="submit" name="BtnPay" value="Pay">' } } },
    }
    const result = await HttpClientService.prototype.payInstallment.call(fake as unknown as HttpClientService, async () => {
        checks++
        if (checks === failAt) throw new Error('SYNTHETIC_LEASE_LOST')
    })
    assert.equal(posts, failAt - 1)
    assert.equal(result.success, false)
    assert.equal(result.outcomeCategory, 'UNCERTAIN_REVIEW_REQUIRED')
})
