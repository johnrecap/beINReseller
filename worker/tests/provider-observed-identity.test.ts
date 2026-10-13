import test from 'node:test'
import assert from 'node:assert/strict'
import { describeRenewalCartFooter, readRenewalSummary, providerSerialFor } from '../src/http/renewal-purchase-guard'
import { parseSoldPackagesReportPage, scanSoldPackagesReport } from '../src/http/sold-packages-report'
import { samePackage, boundPurchaseIdentity, correlateRenewalFulfillment } from '../src/lib/renewal-fulfillment-correlation'
import { observedCart, observedReport, fullCard, providerCard } from './fixtures/renewal-observed'

const quote = { index: 0, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD', appliedPromoCode: null, quoteRevision: 2, packageKey: '2.0' }
test('observed cart binds the dedicated grid, provider serial, checkbox, Remaining and total', () => {
    const result = readRenewalSummary(observedCart(), quote, fullCard)
    assert.equal(result.cardNumber, fullCard)
    assert.equal(result.price, 108)
})
test('Sell footer diagnostic reports structure without customer or provider response values', () => {
    const html = observedCart('Private Package 24 Months', '86.40', 'PRIVATEPROMO') +
        '<input name="__VIEWSTATE" value="secret-state">'
    const diagnostic = describeRenewalCartFooter(html)
    assert.equal(diagnostic.cartCount, 1)
    assert.equal(diagnostic.rowCount, 3)
    assert.equal(diagnostic.cells.length, 2)
    assert.equal(diagnostic.cells[0].colspan, 2)
    assert.equal(diagnostic.cells[1].exactMoney, true)
    assert.equal(diagnostic.labelHasRemaining, true)
    assert.match(diagnostic.labelPattern, /^remaining/)
    const serialized = JSON.stringify(diagnostic)
    for (const sensitive of [fullCard, providerCard, 'Private', '86.40', 'PRIVATEPROMO', 'secret-state']) {
        assert.equal(serialized.includes(sensitive), false)
    }
    const hostile = describeRenewalCartFooter(html.replace('colspan="2">Remaining',
        'colspan="private-token">Customer Alice 12345'))
    assert.equal(hostile.cells[0].colspan, 'other')
    assert.equal(JSON.stringify(hostile).includes('Alice'), false)
    assert.equal(JSON.stringify(hostile).includes('12345'), false)
})
test('actual report criteria support a complete fresh Apply and stability recheck', async () => {
    const html = observedReport()
    const submitted: string[][] = []
    const result = await scanSoldPackagesReport({ freshGet: async () => html, post: async controls => {
        submitted.push(controls.map(control => control.name)); return html
    } })
    assert.equal(result.outcome, 'COMPLETE')
    assert.equal(result.rows.length, 1)
    assert.ok(submitted.every(names => names.includes('ctl00$ContentPlaceHolder1$cboDealer') && names.includes('ctl00$ContentPlaceHolder1$DateFrom$txtDate')))
})
test('explicit report rowspans preserve the invoice/card on continuation lines', () => {
    const first = '<tr>' + ['Subscriber','Country','1001','700000000','Card_CISCO'].map(value => `<td rowspan="2">${value}</td>`).join('') + '<td>Add Premium 6 Months</td><td>11/10/2026</td><td>10/04/2027</td><td>108</td></tr>'
    const second = '<tr><td>Add AFC Asian Cup Saudi Arabia 2027</td><td>01/01/2027</td><td>01/02/2027</td><td>40</td></tr>'
    const result = parseSoldPackagesReportPage(observedReport(first + second, 2))
    assert.equal(result.outcome, 'COMPLETE')
    assert.equal(result.rows[1].invoiceNo, '1001')
    assert.equal(result.rows[1].cardNumber, '700000000')
    assert.equal(parseSoldPackagesReportPage(observedReport(first.replaceAll(' rowspan="2"','') + second, 2)).outcome, 'INCOMPLETE_SCAN')
})
test('fixed event Full Payment label can match only the same named report event', () => {
    assert.equal(samePackage('AFC Asian Cup Saudi Arabia 2027 (Full Payment)', 'Add AFC Asian Cup Saudi Arabia 2027'), true)
    assert.equal(samePackage('AFC Asian Cup Saudi Arabia 2027 (Full Payment)', 'Add AFC Asian Cup Saudi Arabia 2028'), false)
    assert.equal(samePackage('Premium 24 Months + 20% OFF (24 Months)', 'Premium 6 Months'), false)
})

test('only the observed CISCO mapping removes a digit; unknown types and lengths stop', () => {
    assert.equal(providerSerialFor(fullCard, 'CISCO'), '700000000')
    assert.equal(providerSerialFor('123456789012', 'IRDETO'), '123456789012')
    assert.throws(() => providerSerialFor('700000000', 'CISCO'))
    assert.throws(() => providerSerialFor(fullCard, 'UNKNOWN'))
})

for (const [label, change] of [
    ['currency missing', (html: string) => html.replace('Amount USD', 'Amount')],
    ['duplicate grid', (html: string) => html + '<table id="ContentPlaceHolder1_GridView1"></table>'],
    ['ambiguous criteria', (html: string) => html + '<input name="ctl00$ContentPlaceHolder1$DateFrom$txtDate" value="">'],
    ['dangling rowspan', (html: string) => html.replace('<td>1001</td>', '<td rowspan="2">1001</td>')],
    ['zero rowspan', (html: string) => html.replace('<td>1001</td>', '<td rowspan="0">1001</td>')],
    ['malformed decimal', (html: string) => html.replace('<td>108</td>', '<td>1,08</td>')],
] as const) test(`actual report rejects ${label}`, () => {
    assert.equal(parseSoldPackagesReportPage(change(observedReport())).outcome, 'INCOMPLETE_SCAN')
})

test('changing the provider date filter across midnight cannot produce a complete scan', async () => {
    let reads = 0
    const result = await scanSoldPackagesReport({ freshGet: async () => observedReport(), post: async () => {
        reads++
        return observedReport().replace('DateFrom$txtDate" value=""', 'DateFrom$txtDate" value="12/10/2026"')
    } }, { scanAttempts: 1 })
    assert.equal(result.outcome, 'INCOMPLETE_SCAN')
    assert.ok(reads > 0)
})

for (const [label, change] of [
    ['empty cart with stale total', (html: string) => html.replace(/<table[\s\S]*?<\/table>/, '')],
    ['another cart table', (html: string) => html + '<table id="AddOnsCart"><tr><td>Extra</td></tr></table>'],
    ['wrong type', (html: string) => html.replace('value="8" selected>Smartcard: CISCO', 'value="1" selected>Smartcard: Irdeto')],
    ['ambiguous card', (html: string) => html + '<input name="ctl00$ContentPlaceHolder1$tbSerial1" value="700000000">'],
    ['different remaining', (html: string) => html.replace('108USD', '64USD')],
] as const) test(`observed cart rejects ${label}`, () => {
    assert.throws(() => readRenewalSummary(change(observedCart()), quote, fullCard), /PACKAGE_QUOTE_CHANGED/)
})

test('available add-ons are not cart items', () => {
    assert.equal(readRenewalSummary(observedCart() + '<table id="ContentPlaceHolder1_gvAvailableAddOns"><tr><td>40 USD</td></tr></table>', quote, fullCard).price, 108)
})

test('persisted cart cannot be replaced by the expected price or a changed quote/promo', () => {
    const evidence = readRenewalSummary(observedCart(), quote, fullCard)
    assert.deepEqual(boundPurchaseIdentity(evidence, quote, fullCard, 'CISCO'), evidence)
    for (const changed of [undefined, { price: 108 }, { ...evidence, price: 216 }, { ...evidence, promoCode: 'OTHER' },
        { ...evidence, providerSerial: '700000001' }, { ...evidence, quoteRevision: 1 }, { ...evidence, packageKey: '1.0' }]) {
        assert.equal(boundPurchaseIdentity(changed, quote, fullCard, 'CISCO'), null)
    }
})

test('observed commercial offer, bound serial and new report invoice match a plain same-term contract', () => {
    const selected = { ...quote, name: 'Premium 6 Months + 20% OFF (6 Months)', price: 86.4, appliedPromoCode: 'SYNTHETIC' }
    const cart = readRenewalSummary(observedCart(selected.name, '86.40', 'SYNTHETIC'), selected, fullCard)
    const bound = boundPurchaseIdentity(cart, selected, fullCard, 'CISCO')!
    assert.ok(bound)
    const input = {
        baseline: { outcome: 'COMPLETE' as const, invoiceNos: ['1000'], dealerContextHash: 'dealer', capturedAt: '2026-10-11T11:59:00Z' },
        postReport: { outcome: 'COMPLETE' as const, dealerContextHash: 'dealer', observedAt: '2026-10-11T12:01:00Z', rows: [{
            invoiceNo: '1001', cardNumber: bound.providerSerial, itemType: 'Card_CISCO', packageName: 'Add Premium 6 Months + 20% OFF',
            contractStartDate: '11/10/2026', contractExpiryDate: '10/04/2027', providerAmount: '86.40', currency: 'USD' as const, rowFingerprint: 'a'.repeat(64) }] },
        contractCheck: { outcome: 'COMPLETE' as const, observedAt: '2026-10-11T12:02:00Z', contracts: [{
            invoiceNo: '1001', package: 'Premium 6 Months', startDate: '11/10/2026', expiryDate: '10/04/2027', status: 'Active', type: 'Package' }] },
        target: { cardNumber: fullCard, providerSerial: bound.providerSerial, itemType: 'Card_CISCO', selectedPackageName: selected.name,
            providerAmount: String(bound.price), currency: bound.currency, finalMutationStartedAt: '2026-10-11T12:00:00Z' },
    }
    assert.equal(correlateRenewalFulfillment(input).outcome, 'MATCHED')
    for (const mutate of [
        (value: typeof input) => { value.baseline.invoiceNos.push('1001') },
        (value: typeof input) => { value.postReport.rows[0].packageName = 'Add Premium 6 Months' },
        (value: typeof input) => { value.postReport.rows[0].providerAmount = '64' },
        (value: typeof input) => { value.postReport.rows[0].packageName = 'Add Together 6 Months + 20% OFF' },
        (value: typeof input) => { value.target.providerSerial = '700000001' },
        (value: typeof input) => { value.contractCheck.contracts[0].expiryDate = '10/04/2028' },
        (value: typeof input) => { value.contractCheck.contracts[0].package = 'Premium 24 Months' },
        (value: typeof input) => { value.contractCheck.contracts[0].invoiceNo = '1002' },
    ]) {
        const changed = structuredClone(input); mutate(changed)
        assert.notEqual(correlateRenewalFulfillment(changed).outcome, 'MATCHED')
    }
})
