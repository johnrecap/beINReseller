import * as cheerio from 'cheerio'
import { canonicalJson, sameQuotedPackage, type QuotePackage } from '../../../shared/operations/package-quote'
import type { HiddenFields } from './types'

export interface RenewalSummaryEvidence {
    packageName: string
    price: number
    currency: string
    cardNumber: string
    promoCode: string | null
    providerSerial: string
    smartcardType: string
    quoteRevision: number
    packageKey: string
}

export interface PreparedRenewalPurchase {
    selectedPackage: QuotePackage
    summary: RenewalSummaryEvidence
    viewState: HiddenFields
    stbNumber: string
    stbFields: Record<string, string>
}

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
const conflict = () => new Error('PACKAGE_QUOTE_CHANGED')

export function requirePurchaseControl(html: string, name: string, value: string) {
    const $ = cheerio.load(html)
    const controls = $('input, button').filter((_, el) => $(el).attr('name') === name && $(el).attr('value') === value)
    if (controls.length !== 1 || controls.is(':disabled') || controls.parents('fieldset[disabled]').length) throw conflict()
}

export function readStbFields(html: string, stb: string, requireEcho = false): Record<string, string> {
    const $ = cheerio.load(html)
    const first = $('input[name="ctl00$ContentPlaceHolder1$tbStbSerial1"]')
    const second = $('input[name="ctl00$ContentPlaceHolder1$tbStbSerial2"], input[name="ctl00$ContentPlaceHolder1$toStbSerial2"]')
    if (!stb || first.length !== 1 || second.length !== 1 || first.is(':disabled') || second.is(':disabled') ||
        (requireEcho && (first.val() !== stb || second.val() !== stb))) throw conflict()
    return { [first.attr('name')!]: stb, [second.attr('name')!]: stb }
}

function money(text: string): { price: number; currency: string } {
    const match = text.trim().match(/^(\d+|\d{1,3}(?:,\d{3})+)(\.\d{1,2}0*)?\s*([A-Z]{3})$/)
    if (!match) throw conflict()
    const price = Number((match[1] + (match[2] || '')).replace(/,/g, ''))
    if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(Math.round(price * 100))) throw conflict()
    return { price, currency: match[3] }
}

/** Only CISCO's observed 10 -> 9 mapping removes a digit. Other supported types
 * retain the full serial and must be echoed exactly by the provider. */
export function providerSerialFor(cardNumber: string, smartcardType: string): string {
    if (!(smartcardType === 'CISCO' ? /^\d{10}$/.test(cardNumber) : smartcardType === 'IRDETO' && /^\d{10,16}$/.test(cardNumber))) throw conflict()
    return smartcardType === 'CISCO' ? cardNumber.slice(0, -1) : cardNumber
}

export function readProviderCardIdentity(html: string, cardNumber: string, smartcardType = 'CISCO') {
    const $ = cheerio.load(html)
    const providerSerial = providerSerialFor(cardNumber, smartcardType)
    const cards = $('input[name="ctl00$ContentPlaceHolder1$tbSerial1"]')
    const types = $('select[name="ctl00$ContentPlaceHolder1$ddlType"]')
    const selected = types.find('option[selected]')
    if (cards.length !== 1 || String(cards.val()).trim() !== providerSerial || types.length !== 1 ||
        selected.length !== 1 || normalized(selected.text()) !== smartcardType.toLowerCase() ||
        selected.attr('value') !== (smartcardType === 'CISCO' ? '8' : '1')) throw conflict()
    return { cardNumber, providerSerial, smartcardType }
}

/** Observed Add cart contract. Later responses must retain this evidence or stop;
 * an unknown confirmation layout is never replaced with a total/balance alone. */
export function readRenewalSummary(html: string, expected: QuotePackage, cardNumber: string, smartcardType = 'CISCO'): RenewalSummaryEvidence {
    const $ = cheerio.load(html)
    const summaries = $('table[id="ContentPlaceHolder1_gvPackagesCart"]')
    if (!Number.isSafeInteger(expected.quoteRevision) || expected.packageKey !== `${expected.quoteRevision}.${expected.index}`) throw conflict()
    if (summaries.length !== 1 || summaries.find('table').length ||
        summaries.closest('fieldset').find('table').length !== 1 ||
        $('table').filter((_, table) => /cart/i.test($(table).attr('id') || '')).length !== 1 ||
        normalized(summaries.closest('fieldset').children('legend').text()) !== 'shopping cart') throw conflict()
    const rows = summaries.find('tr')
    if (rows.length !== 3) throw conflict()
    const headers = $(rows[0]).children('th').map((_index, cell) => normalized($(cell).text())).get()
    if (canonicalJson(headers) !== canonicalJson(['', 'package name', 'price'])) throw conflict()
    const cells = $(rows[1]).children('td')
    if (cells.length !== headers.length || cells.is('[colspan], [rowspan]')) throw conflict()
    const checkbox = cells.eq(0).find('input[type="checkbox"]')
    const names = cells.eq(1).find('span[id^="ContentPlaceHolder1_gvPackagesCart_lblName_"]')
    if (checkbox.length !== 1 || !/^ctl00\$ContentPlaceHolder1\$gvPackagesCart\$ctl\d+\$cbSelect$/.test(checkbox.attr('name') || '') ||
        names.length !== 1 || names.text().trim() !== cells.eq(1).text().trim()) throw conflict()
    const packageName = names.text().trim()
    const amount = money(cells.eq(2).text())
    const total = $(rows[2]).children('td')
    if (total.length !== 2 || total.eq(0).attr('colspan') !== '2' ||
        normalized(total.eq(0).clone().children().remove().end().text()) !== 'remaining') throw conflict()
    const totalAmount = money(total.eq(1).text())
    const totalLabels = $('[id="ContentPlaceHolder1_lblTotalAmount"]')
    if (totalLabels.length !== 1) throw conflict()
    const displayedTotal = money(totalLabels.text())
    if (!sameQuotedPackage({ name: packageName, ...amount }, expected) ||
        totalAmount.price !== amount.price || totalAmount.currency !== amount.currency ||
        displayedTotal.price !== amount.price || displayedTotal.currency !== amount.currency) throw conflict()
    const identity = readProviderCardIdentity(html, cardNumber, smartcardType)
    const promos = $('input[name="ctl00$ContentPlaceHolder1$txtPromoCode"]')
    const promoCode = promos.length === 1 ? String(promos.val() || '').trim() || null : null
    if (promos.length > 1 || promoCode !== (expected.appliedPromoCode || null)) throw conflict()
    return { packageName, ...amount, ...identity, promoCode, quoteRevision: expected.quoteRevision!, packageKey: expected.packageKey! }
}

export function assertPreparedRenewal(prepared: PreparedRenewalPurchase | null, expected: {
    selectedPackage: QuotePackage; cardNumber: string
}, state: HiddenFields | null, stb: string | null): asserts prepared is PreparedRenewalPurchase {
    if (!prepared || !state?.__VIEWSTATE || !state.__EVENTVALIDATION ||
        !Number.isSafeInteger(expected.selectedPackage.quoteRevision) ||
        expected.selectedPackage.packageKey !== `${expected.selectedPackage.quoteRevision}.${expected.selectedPackage.index}` ||
        canonicalJson(prepared.viewState) !== canonicalJson(state) || prepared.stbNumber !== stb ||
        prepared.summary.cardNumber !== expected.cardNumber ||
        prepared.summary.providerSerial !== providerSerialFor(expected.cardNumber, prepared.summary.smartcardType) ||
        prepared.summary.quoteRevision !== expected.selectedPackage.quoteRevision ||
        prepared.summary.packageKey !== expected.selectedPackage.packageKey ||
        !prepared.stbFields || Object.keys(prepared.stbFields).length !== 2 ||
        prepared.stbFields['ctl00$ContentPlaceHolder1$tbStbSerial1'] !== stb ||
        !['ctl00$ContentPlaceHolder1$tbStbSerial2', 'ctl00$ContentPlaceHolder1$toStbSerial2'].some(name => prepared.stbFields[name] === stb) ||
        !sameQuotedPackage(prepared.selectedPackage, expected.selectedPackage) ||
        !sameQuotedPackage({ name: prepared.summary.packageName, ...prepared.summary }, expected.selectedPackage) ||
        prepared.selectedPackage.quoteRevision !== expected.selectedPackage.quoteRevision ||
        prepared.selectedPackage.packageKey !== expected.selectedPackage.packageKey ||
        prepared.selectedPackage.appliedPromoCode !== expected.selectedPackage.appliedPromoCode ||
        prepared.summary.promoCode !== (expected.selectedPackage.appliedPromoCode || null)) throw conflict()
}
