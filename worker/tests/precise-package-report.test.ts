import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as cheerio from 'cheerio'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as quote from '../../shared/operations/package-quote'
import * as price from '../../shared/operations/provider-price'
import * as identity from '../src/lib/report-package-identity'
import type { AvailablePackage } from '../src/http/types'
import type * as fulfillment from '../src/lib/same-day-report-fulfillment'
import * as guard from '../src/http/renewal-purchase-guard'
import { observedCart, observedReport, fullCard } from './fixtures/renewal-observed'
import { parseSoldPackagesReportPage } from '../src/http/sold-packages-report'

const httpPath = 'worker/src/http/HttpClientService.ts'
const deps = Object.fromEntries(ts.preProcessFile(readFileSync(httpPath, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
Object.assign(deps, { cheerio, './renewal-purchase-guard': guard, '../../../shared/operations/package-quote': quote })
const { HttpClientService } = loadIsolatedModule<{ HttpClientService: { prototype: {
    extractPackagesFromHtml: ($: cheerio.CheerioAPI) => AvailablePackage[] } } }>(httpPath, deps)
const { correlateSameDayReport } = loadIsolatedModule<typeof fulfillment>(
    'worker/src/lib/same-day-report-fulfillment.ts', {
        '@prisma/client': { Prisma: {} }, './fulfillment-baseline': {}, './fulfillment-finalization': {}, './prisma': {},
        '../../../shared/operations/provider-price': price, './report-package-identity': identity,
    })

const grid = (price = '108.00 USD') => `<table id="ContentPlaceHolder1_gvAvailablePackages">
    <tr><th></th><th>Package Name</th><th>Full Price</th></tr>
    <tr><td><input type="checkbox" name="ctl00$ContentPlaceHolder1$gvAvailablePackages$ctl02$cbSelect"><span>999 USD</span></td>
    <td><span id="ContentPlaceHolder1_gvAvailablePackages_lblName_0">Premium 6 Months (6 Months)</span></td><td>${price}</td></tr></table>`

test('provider price is read only from its column despite a misleading amount elsewhere in the row', () => {
    const client = Object.create(HttpClientService.prototype)
    const packages = client.extractPackagesFromHtml(cheerio.load(grid()))
    assert.equal(packages.length, 1)
    assert.equal(packages[0].price, 108)
    assert.equal(packages[0].priceDecimal, '108')
    assert.equal(packages[0].priceText, '108.00 USD')
})

test('observed Reports Add prefix and omitted repeated duration match the original selected package', () => {
    const report = parseSoldPackagesReportPage(observedReport())
    const result = correlateSameDayReport({ report, cardNumber: fullCard, smartcardType: 'CISCO',
        selectedPackage: { index: 0, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD' },
        claimedInvoices: new Map(), operationId: 'synthetic-operation' })
    assert.equal(result.outcome, 'MATCHED')
    assert.equal(result.row?.packageName, 'Add Premium 6 Months')
})

test('Reports amount differing below one cent cannot match by rounding', () => {
    const report = parseSoldPackagesReportPage(observedReport().replace('<td>108</td>', '<td>108.004</td>'))
    const result = correlateSameDayReport({ report, cardNumber: fullCard, smartcardType: 'CISCO',
        selectedPackage: { index: 0, name: 'Add Premium 6 Months', price: 108, currency: 'USD' },
        claimedInvoices: new Map(), operationId: 'synthetic-operation' })
    assert.equal(result.outcome, 'VALID_NO_MATCH')
})

for (const [input, decimal] of [['43.20', '43.2'], ['1,234.5000', '1234.5'], ['000108.00', '108'],
    ['108.004', '108.004'], ['0.0000001', '0.0000001']] as const) {
    test(`exact provider decimal preserves ${input}`, () => {
        assert.equal(price.readProviderPrice(`${input} USD`)?.priceDecimal, decimal)
        assert.equal(price.positiveDecimal(Number(decimal)), decimal)
    })
}
for (const input of ['43,20 USD', '1,23,456 USD', '0 USD', '-1 USD', '1e2 USD',
    '43.20 USD 99 USD', '9007199254740993 USD', '0.10000000000000001 USD', '43.2 EUR USD']) {
    test(`ambiguous or lossy price is rejected: ${input}`, () => {
        assert.equal(price.readProviderPrice(input), null)
        assert.equal(Object.create(HttpClientService.prototype).extractPackagesFromHtml(cheerio.load(grid(input))).length, 0)
    })
}

for (const [label, transform] of [
    ['missing name header', (html: string) => html.replace('Package Name', 'Package')],
    ['missing price header', (html: string) => html.replace('Full Price', 'Price')],
    ['duplicate name header', (html: string) => html.replace('<th></th>', '<th>Package Name</th>')],
    ['duplicate price header', (html: string) => html.replace('<th></th>', '<th>Full Price</th>')],
    ['duplicate checkbox', (html: string) => html.replace('<span>999 USD</span>', '<input type="checkbox" name="other">')],
    ['malformed second row', (html: string) => html.replace('</table>', '<tr><td>broken</td></tr></table>')],
] as const) test(`package list fails closed with ${label}`, () => {
    assert.equal(Object.create(HttpClientService.prototype).extractPackagesFromHtml(cheerio.load(transform(grid()))).length, 0)
})

test('header positions can move without attaching the wrong amount or control', () => {
    const html = `<table id="ContentPlaceHolder1_gvAvailablePackages"><tr><th>Full Price</th><th>Select</th><th>Package Name</th></tr>
        <tr><td>108 USD</td><td><input type="checkbox" name="row-a"></td><td><span id="a_lblName">Premium 6 Months (6 Months)</span></td></tr>
        <tr><td>108 USD</td><td><input type="checkbox" name="row-b"></td><td><span id="b_lblName">Together 12 Months (12 Months)</span></td></tr></table>`
    const client = Object.create(HttpClientService.prototype)
    const packages = client.extractPackagesFromHtml(cheerio.load(html))
    const op = { availablePackages: packages, responseData: quote.readyPackageQuote({}, packages, 3, null) }
    const selected = quote.selectQuotedPackage(op, { quoteRevision: 3, packageKey: '3.2' }).selectedPackage
    assert.equal(selected.checkboxValue, 'row-b')
    assert.equal(selected.name, 'Together 12 Months (12 Months)')
    assert.equal(selected.priceDecimal, '108')
    assert.throws(() => quote.selectQuotedPackage(op, { quoteRevision: 2, packageKey: '2.2' }), /STALE_PACKAGE_QUOTE/)
})

for (const [selected, observed, matches] of [
    ['Premium 6 Months (6 Months)', '  ADD Premium  6 Months ', true],
    ['Together 6 Months + 20% OFF (6 Months)', 'Renewal Together 6 Months + 20% OFF', true],
    ['Together 6 Months + 20% OFF (6 Months)', 'Add Together 6 Months + 25% OFF', false],
    ['Together 6 Months (6 Months)', 'Add Together 24 Months', false],
    ['Together 6 Months (24 Months)', 'Add Together 6 Months', false],
    ['Together 6 Months + bonus (6 Months)', 'Add Together 6 Months', false],
    ['AFC Asian Cup Saudi Arabia 2027 (Full Payment)', 'Add AFC Asian Cup Saudi Arabia 2027', true],
    ['AFC Asian Cup Saudi Arabia 2027 (Full Payment)', 'Add AFC Asian Cup Saudi Arabia 2028', false],
    ['AFC Asian Cup Saudi Arabia 2027 (Full Payment)', 'Add AFC Asian Cup Saudi Arabia 2027 (First Payment)', false],
    ['Premium 6 Months (Full Payment)', 'Add Premium 6 Months', false],
] as const) test(`report display rules: ${selected} / ${observed}`, () => {
    assert.equal(identity.compareReportPackageName(selected, observed).matches, matches)
})

test('quote and cart accept insignificant zeros but reject sub-cent changes and inconsistent saved decimals', () => {
    const selected = { index: 1, name: 'Premium 6 Months (6 Months)', price: 108, priceDecimal: '108.00', currency: 'USD',
        quoteRevision: 0, packageKey: '0.1', appliedPromoCode: null }
    assert.equal(quote.sameQuotedPackage(selected, { ...selected, priceDecimal: '108' }), true)
    assert.equal(quote.sameQuotedPackage(selected, { ...selected, price: 108.004, priceDecimal: '108.004' }), false)
    assert.equal(quote.sameQuotedPackage(selected, { ...selected, priceDecimal: '108.004' }), false)
    assert.equal(guard.readRenewalSummary(observedCart(), selected, fullCard).priceDecimal, '108')
    assert.throws(() => guard.readRenewalSummary(observedCart(undefined, '108.004'), selected, fullCard), /PACKAGE_QUOTE_CHANGED/)
    assert.equal(price.quotedPriceDecimal({ price: 1e-7 }), '0.0000001')
    assert.equal(price.quotedPriceDecimal({ price: 108 }), '108')
})
