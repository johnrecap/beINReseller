import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import type { SoldReportSafeRow, SoldReportScanResult } from '../src/http/sold-packages-report'

const { cairoReportDay, correlateSameDayReport } = loadIsolatedModule<{
    cairoReportDay: (at: Date) => string
    correlateSameDayReport: (input: {
        report: SoldReportScanResult; cardNumber: string; smartcardType: string
        selectedPackage: { name: string; price: number; currency: string }
        claimedInvoices: ReadonlyMap<string, string>; operationId: string
    }) => { outcome: string; reasonCode: string; row: SoldReportSafeRow | null }
}>('worker/src/lib/same-day-report-fulfillment.ts', {
    '@prisma/client': { Prisma: {} }, './fulfillment-baseline': {},
    './fulfillment-finalization': {}, './prisma': {},
})

const selected = { name: 'Premium 6 Months + 20% OFF (6 Months)', price: 86.4, currency: 'USD' }
const row = (invoiceNo: string, changes: Partial<SoldReportSafeRow> = {}): SoldReportSafeRow => ({
    invoiceNo, cardNumber: '7517717372', itemType: 'Card_CISCO',
    packageName: selected.name, contractStartDate: '14/10/2026',
    contractExpiryDate: '13/04/2027', providerAmount: '86.40', currency: 'USD',
    rowFingerprint: 'a'.repeat(64), ...changes,
})
const report = (rows: SoldReportSafeRow[], outcome: SoldReportScanResult['outcome'] = 'COMPLETE'):
    SoldReportScanResult => ({ outcome, rows, dealerContextHash: 'b'.repeat(64),
        pageCount: 1, pageCap: 100, scanAttemptCount: 1, firstPageWatermark: 'c'.repeat(64) })
const match = (rows: SoldReportSafeRow[], claimedInvoices = new Map<string, string>(),
    outcome: SoldReportScanResult['outcome'] = 'COMPLETE') => correlateSameDayReport({
        report: report(rows, outcome), cardNumber: '7517717372', smartcardType: 'CISCO',
        selectedPackage: selected, claimedInvoices, operationId: 'operation-new',
    })

test('Cairo report date is fixed to payment day even at a UTC midnight boundary', () => {
    assert.equal(cairoReportDay(new Date('2026-10-12T22:30:00Z')), '2026-10-13')
})

test('one complete same-day row matches full package, amount, card and type', () => {
    assert.equal(match([row('INV-1')]).row?.invoiceNo, 'INV-1')
    assert.equal(match([row('INV-1', { cardNumber: '751771737' })]).outcome, 'MATCHED')
    assert.equal(match([row('INV-1', { contractStartDate: '30/11/2026' })]).outcome, 'MATCHED')
})

test('different offer, duration, amount, item type or card never match', () => {
    for (const changed of [
        { packageName: 'Premium 24 Months + 20% OFF (24 Months)' },
        { packageName: 'Premium 6 Months + 30% OFF (6 Months)' },
        { providerAmount: '216.00' }, { itemType: 'Card_IRDETO' },
        { cardNumber: '7517717373' },
    ]) assert.equal(match([row('INV-1', changed)]).outcome, 'VALID_NO_MATCH')
})

test('multiple available invoices and another operation claim block auto completion', () => {
    assert.equal(match([row('INV-1'), row('INV-2')]).reasonCode, 'MULTIPLE_MATCHING_INVOICES')
    assert.equal(match([row('INV-1')], new Map([['INV-1', 'another-operation']])).outcome, 'PROOF_CONFLICT')
    assert.equal(match([row('INV-1')], new Map([['INV-1', 'operation-new']])).outcome, 'MATCHED')
})

test('incomplete or failed scan is never interpreted as an empty sales report', () => {
    assert.equal(match([], new Map(), 'INCOMPLETE_SCAN').outcome, 'INCOMPLETE_SCAN')
    assert.equal(match([], new Map(), 'CHECK_FAILED').outcome, 'CHECK_FAILED')
    assert.equal(match([]).outcome, 'VALID_NO_MATCH')
})
