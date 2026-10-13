import * as cheerio from 'cheerio'
import { canonicalJson, sameQuotedPackage, type QuotePackage } from '../../../shared/operations/package-quote'
import type { HiddenFields } from './types'
import { collectSuccessfulControls, encodeSuccessfulControls } from './webforms-form'

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

export class ProviderSmartcardFormError extends Error {
    constructor(readonly reason: string, readonly requestedType: string) {
        super('PROVIDER_SMARTCARD_FORM_UNSUPPORTED')
        this.name = 'ProviderSmartcardFormError'
    }
}

/** Type labels describe the card technology, not a package offer. Accept only
 * the explicit technology and known field-label prefixes; never substring-match
 * a package/device name, choose a row position, or fall back to the other type. */
export function readProviderSmartcardOption($: cheerio.CheerioAPI, smartcardType: string,
    options: { requireSelected?: boolean; allowDisabled?: boolean } = {}) {
    const reject = (reason: string): never => { throw new ProviderSmartcardFormError(reason, smartcardType) }
    const expectedValue = smartcardType === 'CISCO' ? '8' : smartcardType === 'IRDETO' ? '1' : reject('UNKNOWN_TYPE')
    const name = 'ctl00$ContentPlaceHolder1$ddlType'
    const controls = $(`select[name="${name}"]`)
    if (controls.length !== 1) reject('TYPE_CONTROL_MISSING_OR_AMBIGUOUS')
    if (!options.allowDisabled && (controls.is(':disabled') || controls.parents('fieldset[disabled]').length)) reject('TYPE_CONTROL_DISABLED')
    const typeOf = (label: string) => normalized(label)
        .replace(/^smart\s*card\s*:\s*/, '').toUpperCase()
    const matches = controls.find('option').filter((_, el) => typeOf($(el).text()) === smartcardType)
    if (matches.length !== 1) reject('TYPE_OPTION_MISSING_OR_AMBIGUOUS')
    if (matches.attr('value') !== expectedValue ||
        controls.find('option').filter((_, el) => $(el).attr('value') === expectedValue).length !== 1) reject('TYPE_VALUE_MISMATCH')
    if (matches.is(':disabled') || matches.parents('optgroup[disabled]').length) reject('TYPE_OPTION_DISABLED')
    if (options.requireSelected) {
        const selected = controls.find('option[selected]')
        if (selected.length !== 1 || selected[0] !== matches[0]) reject('TYPE_SELECTION_MISMATCH')
    }
    return { name, value: expectedValue }
}

export function validateProviderSerialInput($: cheerio.CheerioAPI, providerSerial: string, smartcardType: string) {
    const inputs = $('input[name="ctl00$ContentPlaceHolder1$tbSerial1"]')
    if (inputs.length !== 1 || inputs.is(':disabled') || inputs.parents('fieldset[disabled]').length) {
        throw new ProviderSmartcardFormError('SERIAL_CONTROL_MISSING_OR_UNAVAILABLE', smartcardType)
    }
    const maxLength = inputs.attr('maxlength')
    if (maxLength !== undefined && (!/^\d+$/.test(maxLength) || Number(maxLength) < providerSerial.length)) {
        throw new ProviderSmartcardFormError('SERIAL_LENGTH_MISMATCH', smartcardType)
    }
}

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
    try { readProviderSmartcardOption($, smartcardType, { requireSelected: true, allowDisabled: true }) }
    catch { throw conflict() }
    if (cards.length !== 1 || String(cards.val()).trim() !== providerSerial) throw conflict()
    return { cardNumber, providerSerial, smartcardType }
}

/** Rebuild the promo POST from the same bound WebForms response that supplied
 * the displayed offer. A stale form or missing control must never be guessed. */
export function buildPromoSubmission(html: string, state: HiddenFields, cardNumber: string,
    smartcardType: string, promoCode: string, removing = false): URLSearchParams {
    const $ = cheerio.load(html)
    const forms = $('form')
    const form = forms.eq(0)
    const promoName = 'ctl00$ContentPlaceHolder1$txtPromoCode'
    const buttonName = 'ctl00$ContentPlaceHolder1$btnPromoCode'
    const promoInput = form.find(`input[name="${promoName}"]`)
    const button = form.find(`input[name="${buttonName}"]`)
    if ((!promoCode && !removing) || (removing && promoCode !== '') ||
        promoCode !== promoCode.toUpperCase() || forms.length !== 1 ||
        promoInput.length !== 1 || promoInput.is(':disabled') ||
        button.length !== 1 || button.attr('type')?.toLowerCase() !== 'submit' ||
        !button.attr('value') || button.is(':disabled') ||
        form.find('select[name="ctl00$ContentPlaceHolder1$ddlType"]').length !== 1 ||
        form.find('input[name="ctl00$ContentPlaceHolder1$tbSerial1"]').length !== 1 ||
        form.find('table[id="ContentPlaceHolder1_gvAvailablePackages"]').length !== 1 ||
        $('table[id="ContentPlaceHolder1_gvPackagesCart"]').length ||
        form.find('table[id="ContentPlaceHolder1_gvAvailablePackages"] input[type="checkbox"]:checked').length) {
        throw new Error('PROMO_REFRESH_UNVERIFIED')
    }
    readProviderCardIdentity(html, cardNumber, smartcardType)
    if (!state.__VIEWSTATE || !state.__EVENTVALIDATION ||
        form.find('input[name="__VIEWSTATE"]').length !== 1 ||
        form.find('input[name="__EVENTVALIDATION"]').length !== 1 ||
        Object.entries(state).some(([name, value]) => {
            const fields = form.find(`input[name="${name}"]`)
            return fields.length !== 1 || String(fields.val() ?? '') !== value
        })) {
        throw new Error('PROMO_REFRESH_UNVERIFIED')
    }
    const controls = collectSuccessfulControls(html, { activatedSubmitName: buttonName,
        overrides: { [promoName]: promoCode, __EVENTTARGET: '', __EVENTARGUMENT: '' } })
    const post = encodeSuccessfulControls(controls)
    if (post.getAll(promoName).length !== 1 || post.getAll(buttonName).length !== 1 ||
        post.has('ctl00$ContentPlaceHolder1$btnAddToCart') ||
        post.has('ctl00$ContentPlaceHolder1$btnSell') ||
        post.has('ctl00$ContentPlaceHolder1$BtnPay')) throw new Error('PROMO_REFRESH_UNVERIFIED')
    return post
}

/** A receiver number is usable only when the Check response identifies this
 * card and has one explicitly labelled STB. An unrelated 15-digit page value
 * or an STB left on a reused client is not evidence. */
export function readCheckedCardStb(html: string, cardNumber: string): string | null {
    const $ = cheerio.load(html)
    const text = $('body').text().replace(/\s+/g, ' ')
    const cardInputs = $('input[name="ctl00$ContentPlaceHolder1$tbSerial"]')
    const escapedCard = cardNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const echoed = cardInputs.length === 1 && String(cardInputs.val()).trim() === cardNumber ||
        new RegExp(`(?:^|\\D)${escapedCard}(?:\\D|$)`).test(text)
    if (!echoed) return null
    const labels = [text, $('#ContentPlaceHolder1_lblSerial').text()]
    if (labels.some(value => /(?:\bSTB(?:\(s\))?|رقم الريسيفر)\s*:\s*\d{10,16}\s*[,;/]\s*\d{10,16}/i.test(value))) return null
    const candidates = labels.flatMap(value => [
        ...value.matchAll(/\bSTB(?:\(s\))?\s*:\s*(\d{10,16})\b/gi),
        ...value.matchAll(/رقم الريسيفر\s*:\s*(\d{10,16})\b/g),
    ].map(match => match[1]))
    const unique = [...new Set(candidates)]
    return unique.length === 1 ? unique[0] : null
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
