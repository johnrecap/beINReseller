import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { projectRenewalReceipt } from '../../src/lib/operations/receipt'

const proof = {
    proofKind: 'SOLD_REPORT_SAME_DAY', invoiceNo: 'INV-1', cardNumberSnapshot: '7517717372',
    reportItemType: 'Card_CISCO', reportPackageName: 'Premium 6 Months + 20% OFF (6 Months)',
    promoCodeSnapshot: 'SEASONOFFERS', providerAmount: new Prisma.Decimal('86.40'),
    currency: 'USD', contractStartDate: '14/10/2026', contractExpiryDate: '13/04/2027',
    reportDate: new Date('2026-10-13T00:00:00Z'), reportObservedAt: new Date('2026-10-13T08:00:00Z'),
    customerChargedAmount: new Prisma.Decimal('90.00'),
}

test('receipt projects immutable provider sale and customer charge separately', () => {
    const receipt = projectRenewalReceipt({ id: 'op-1', status: 'COMPLETED',
        fulfillmentAuthority: 'AUTOMATED_REPORT', fulfillmentProof: proof })
    assert.equal(receipt?.beinInvoiceNo, 'INV-1')
    assert.equal(receipt?.providerAmount, '86.40')
    assert.equal(receipt?.customerChargedAmount, '90.00')
    assert.equal(receipt?.reportDate, '2026-10-13')
})

test('unverified, legacy or incomplete proof cannot expose a confirmed receipt', () => {
    assert.equal(projectRenewalReceipt({ id: 'op-1', status: 'REVIEW_REQUIRED',
        fulfillmentAuthority: 'NONE', fulfillmentProof: proof }), null)
    assert.equal(projectRenewalReceipt({ id: 'op-1', status: 'COMPLETED',
        fulfillmentAuthority: 'AUTOMATED_COMPOSITE', fulfillmentProof: proof }), null)
})
