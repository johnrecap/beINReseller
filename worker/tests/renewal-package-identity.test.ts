import test from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import { findMatchingRenewalContract } from '../src/lib/contract-verification'
import { matchFreshPackage } from '../src/lib/promo-quote'
import * as packageQuote from '../../shared/operations/package-quote'
import * as purchaseGuard from '../src/http/renewal-purchase-guard'
import { correlateRenewalFulfillment } from '../src/lib/renewal-fulfillment-correlation'
import { observedCart, fullCard, providerCard } from './fixtures/renewal-observed'

function httpPrototype() {
    const deps: Record<string, unknown> = { cheerio, './renewal-purchase-guard': purchaseGuard,
        '../../../shared/operations/package-quote': packageQuote }
    for (const name of ['axios', 'axios-retry', 'axios-cookiejar-support', 'tough-cookie', 'https', '../lib/prisma',
        '../utils/totp-generator', '../utils/proxy-manager', 'http-cookie-agent/http', 'socks-proxy-agent', 'https-proxy-agent',
        './webforms-form', './sold-packages-report', '../../../shared/operations/renewal-fulfillment-config']) deps[name] = {}
    return loadIsolatedModule<{ HttpClientService: { prototype: object } }>('worker/src/http/HttpClientService.ts', deps).HttpClientService.prototype
}

test('exported HTTP session retains its bound account and rejects importing another account', async () => {
    const client = Object.assign(Object.create(httpPrototype()), {
        accountId: 'account-bound', jar: { serialize: async () => ({ cookies: [] }) },
        currentViewState: null, preparedRenewal: null, sessionExpiresAt: null,
    })
    assert.equal((await client.exportSession()).accountId, 'account-bound')
    await assert.rejects(client.importSession({ accountId: 'account-other', cookies: '{}' }), /PROVIDER_SESSION_ACCOUNT_MISMATCH/)
    assert.equal(client.sessionValid, false)
})

test('operation session preserves the selected WebForms offer and its quote revision across workers', async () => {
    const selection = { packages: [{ index: 0, name: 'Premium 6 Months', price: 86.4,
        checkboxValue: 'provider-row-17' }], viewState: { __VIEWSTATE: 'state',
        __EVENTVALIDATION: 'validation' }, cardNumber: '7517717372', smartcardType: 'CISCO', promoCode: 'SEASONOFFERS' }
    const client = Object.assign(Object.create(httpPrototype()), {
        accountId: 'account-bound', jar: { serialize: async () => ({ cookies: [] }) },
        currentViewState: selection.viewState, renewalSelection: selection,
        preparedRenewal: null, sessionExpiresAt: null,
    })
    client.setRenewalQuoteRevision(4)
    const snapshot = JSON.parse(JSON.stringify(await client.exportSession()))
    assert.equal(snapshot.renewalSelection.quoteRevision, 4)
    assert.equal(snapshot.renewalSelection.packages[0].checkboxValue, 'provider-row-17')
    assert.equal(snapshot.renewalSelection.promoCode, 'SEASONOFFERS')
})

test('saved offer refuses another revision, card or equally priced different package before Add', () => {
    const state = { __VIEWSTATE: 'state', __EVENTVALIDATION: 'validation' }
    const client = Object.assign(Object.create(httpPrototype()), {
        sessionValid: true, sessionExpiresAt: Date.now() + 60_000,
        currentViewState: state,
        renewalSelection: { packages: [{ index: 8, name: 'Premium 6 Months', price: 86.4,
            checkboxValue: 'moved-row' }], viewState: state, cardNumber: '7517717372',
            smartcardType: 'CISCO', promoCode: 'SEASONOFFERS', quoteRevision: 7 },
    })
    const quote = { index: 2, name: 'Premium 6 Months', price: 86.4, currency: 'USD',
        quoteRevision: 7, packageKey: '7.2', appliedPromoCode: 'SEASONOFFERS' }
    const context = { cardNumber: '7517717372', smartcardType: 'CISCO' }
    assert.doesNotThrow(() => client.assertRenewalSelection(quote, context))
    assert.throws(() => client.assertRenewalSelection({ ...quote, quoteRevision: 8,
        packageKey: '8.2' }, context), /PACKAGE_QUOTE_CHANGED/)
    assert.throws(() => client.assertRenewalSelection(quote, { ...context,
        cardNumber: '7517717373' }), /PACKAGE_QUOTE_CHANGED/)
    assert.throws(() => client.assertRenewalSelection({ ...quote, name: 'Basic 6 Months' },
        context), /PACKAGE_QUOTE_CHANGED/)
})

const selected = { index: 0, name: 'Premium 6 Months + 20% OFF (6 Months)', price: 86.4, currency: 'USD',
    checkboxValue: 'current-control', quoteRevision: 2, packageKey: '2.0', appliedPromoCode: null }
const state = { __VIEWSTATE: 'synthetic-state', __VIEWSTATEGENERATOR: 'generator', __EVENTVALIDATION: 'validation' }
const hidden = Object.entries(state).map(([name, value]) => `<input type="hidden" id="${name}" name="${name}" value="${value}">`).join('')
const promoForm = `<form id="aspnetForm">${hidden}
    <input type="hidden" name="__EVENTTARGET" value=""><input type="hidden" name="__EVENTARGUMENT" value="">
    <select name="ctl00$ContentPlaceHolder1$ddlType"><option value="1">Smartcard: Irdeto</option>
        <option value="8" selected>Smartcard: CISCO</option></select>
    <input name="ctl00$ContentPlaceHolder1$tbSerial1" value="${providerCard}" maxlength="9">
    <table id="ContentPlaceHolder1_gvAvailablePackages"><tr><td><input type="checkbox" name="fresh-row"></td></tr></table>
    <input name="ctl00$ContentPlaceHolder1$txtPromoCode" value="">
    <input type="submit" name="ctl00$ContentPlaceHolder1$btnPromoCode" value="Submit">
    <input type="submit" name="ctl00$ContentPlaceHolder1$btnAddToCart" value="Add >">
    </form>`

test('Check page STB proof requires this card and one labelled receiver', () => {
    const result = (card: string, text: string) => `<body><input name="ctl00$ContentPlaceHolder1$tbSerial" value="${card}">${text}</body>`
    assert.equal(purchaseGuard.readCheckedCardStb(result(fullCard, 'STB(s): 947242535522003'), fullCard), '947242535522003')
    assert.equal(purchaseGuard.readCheckedCardStb(result('7000000000', 'STB(s): 947242535522003'), fullCard), null)
    assert.equal(purchaseGuard.readCheckedCardStb(result(fullCard, '947242535522003'), fullCard), null)
    assert.equal(purchaseGuard.readCheckedCardStb(result(fullCard,
        'STB(s): 947242535522003 STB: 947242535522004'), fullCard), null)
    assert.equal(purchaseGuard.readCheckedCardStb(result(fullCard,
        'STB(s): 947242535522003, 947242535522004'), fullCard), null)
})

test('Check request clears a receiver left from an earlier card when this response has no pairing', async () => {
    const client = Object.assign(Object.create(httpPrototype()), {
        config: { checkUrl: '/check', loginUrl: '/login' }, currentStbNumber: '947242535522003',
        buildFullUrl: (path: string) => path, buildPostHeaders: () => ({}),
        checkForSessionExpiry: () => null, checkForErrors: () => null,
        extractHiddenFields: () => state, extractButtonValue: () => 'Check',
        axios: { get: async () => ({ data: hidden }), post: async () => ({ data:
            `<body>${hidden}<input name="ctl00$ContentPlaceHolder1$tbSerial" value="${fullCard}">No receiver here</body>` }) },
    })
    const checked = await client.checkCard(fullCard)
    assert.equal(checked.success, true)
    assert.equal(checked.stbNumber, undefined)
    assert.equal(client.getSTBNumber(), null)
})

// Observed Add cart structure, with synthetic offers. Repeated later-stage HTML is
// a simulation only: no live Sell/STB/OK/Pay response was captured.
function summary(name = selected.name, price = '86.40 USD') {
    return hidden + observedCart(name, price.replace(' USD', '')) + `
        <input type="submit" name="ctl00$ContentPlaceHolder1$btnSell" value="Sell">
        <input name="ctl00$ContentPlaceHolder1$tbStbSerial1" value="synthetic-stb">
        <input name="ctl00$ContentPlaceHolder1$tbStbSerial2" value="synthetic-stb">
        <input type="submit" name="ctl00$ContentPlaceHolder1$btnStbOk" value="Ok">
        <input type="submit" name="ctl00$ContentPlaceHolder1$BtnPay" value="Pay">
        <input type="radio" name="ctl00$ContentPlaceHolder1$Epay" value="RbdDirectPay">`
}

function purchaseClient(responses: string[]) {
    const posts: URLSearchParams[] = []
    const client = Object.assign(Object.create(httpPrototype()), {
        config: { renewUrl: '/renew' }, currentViewState: state, currentStbNumber: 'synthetic-stb',
        renewalSelection: { packages: [selected], viewState: { ...state }, cardNumber: fullCard,
            smartcardType: 'CISCO', promoCode: null, formHtml: promoForm },
        buildFullUrl: () => 'https://synthetic.invalid/renew', buildPostHeaders: () => ({}),
        axios: { post: async (_url: string, body: string) => { posts.push(new URLSearchParams(body));
            assert.ok(responses.length, 'unexpected provider POST'); return { data: responses.shift() } },
        get: async () => { throw new Error('Unexpected navigation during purchase') } },
    })
    return { client, posts }
}

for (const [name, price] of [['Together 24 Months', '216 USD'], ['Together 24 Months', '86.40 USD'],
    ['Premium 24 Months + 20% OFF (24 Months)', '86.40 USD']]) {
    test(`cart mismatch ${name}/${price} stops after Add, before Sell or Pay`, async () => {
        const h = purchaseClient([summary(name, price), summary(name, price), summary(name, price)])
        const result = await h.client.completePurchase(selected, undefined, 'synthetic-stb', true, async () => {})
        assert.equal(result.success, false)
        assert.equal(h.posts.length, 1)
    })
}

test('a legacy cached session with no bound cart evidence cannot submit final OK', async () => {
    const h = purchaseClient([summary(), '<span>Insufficient Credit</span>'])
    const result = await h.client.confirmPurchase(86.4, async () => {}, async () => {},
        { selectedPackage: selected, cardNumber: fullCard })
    assert.equal(result.success, false)
    assert.equal(h.posts.length, 0)
})

const accepted = { selectedPackage: selected, cardNumber: fullCard }
const paymentPage = () => `${summary()}<p>Your Current Credit Balance is 1,000 USD</p>`
const paidPage = '<p>Contract Created Successfully</p><p>Your Current Credit Balance is 913.60 USD</p>'

async function preparedClient(finalResponses: string[]) {
    const h = purchaseClient([summary(), summary(), summary(), ...finalResponses])
    const prepared = await h.client.completePurchase(selected, undefined, 'synthetic-stb', true, async () => {})
    assert.equal(prepared.awaitingConfirm, true)
    assert.equal(prepared.packageEvidence.packageName, selected.name)
    return h
}

test('the checked receiver is entered in both later STB fields and retained for final OK', async () => {
    const h = await preparedClient([paymentPage(), paidPage])
    const first = 'ctl00$ContentPlaceHolder1$tbStbSerial1'
    const second = 'ctl00$ContentPlaceHolder1$tbStbSerial2'
    assert.equal(h.posts[2].get(first), 'synthetic-stb')
    assert.equal(h.posts[2].get(second), 'synthetic-stb')
    assert.equal(h.posts[2].has('ctl00$ContentPlaceHolder1$btnStbOk'), false)
    await h.client.confirmPurchase(86.4, async () => {}, async () => {}, accepted)
    assert.equal(h.posts[3].get(first), 'synthetic-stb')
    assert.equal(h.posts[3].get(second), 'synthetic-stb')
    assert.equal(h.posts[3].get('ctl00$ContentPlaceHolder1$btnStbOk'), 'Ok')
})

test('a mismatched second receiver echo stops before final OK', async () => {
    const changedEcho = summary().replace('tbStbSerial2" value="synthetic-stb"',
        'tbStbSerial2" value="another-receiver"')
    const h = purchaseClient([summary(), summary(), changedEcho])
    const result = await h.client.completePurchase(selected, undefined, 'synthetic-stb', true, async () => {})
    assert.equal(result.message, 'PACKAGE_QUOTE_CHANGED')
    assert.equal(h.posts.length, 3)
    assert.equal(h.posts.some(post => post.has('ctl00$ContentPlaceHolder1$btnStbOk')), false)
})

for (const stage of [0, 1, 2, 3]) {
    test(`unreadable or expired response at purchase stage ${stage} cannot reach Pay`, async () => {
        const responses = [summary(), summary(), summary(), paymentPage(), paidPage]
        responses[stage] = '<html><title>Login</title><body>Sign In</body></html>'
        const h = purchaseClient(responses)
        const result = await h.client.completePurchase(selected, undefined, 'synthetic-stb', true, async () => {})
        if (stage === 3) {
            assert.equal(result.awaitingConfirm, true)
            await h.client.confirmPurchase(86.4, async () => {}, async () => {}, accepted)
        } else assert.equal(result.success, false)
        assert.equal(h.posts.some(post => post.has('ctl00$ContentPlaceHolder1$BtnPay')), false)
    })
}

for (const [label, changed] of [
    ['extra item', summary().replace('</table>', '<tr><td>Extra 3 Months</td><td>1 USD</td></tr></table>')],
    ['duplicate summary', summary() + summary()],
    ['missing total', summary().replace('ContentPlaceHolder1_lblTotalAmount', 'missing')],
    ['different total', summary().replace('>86.40 USD</span>', '>216 USD</span>')],
    ['unknown layout', summary().replace('Shopping Cart', 'Unknown Grid')],
    ['different currency', summary().replaceAll('USD', 'EUR')],
    ['different card', summary().replace(providerCard, '700000002')],
    ['different offer', summary('Premium 6 Months')],
    ['promo introduced', summary() + '<input name="ctl00$ContentPlaceHolder1$txtPromoCode" value="OTHER">'],
] as const) {
    test(`${label} in final payment response prevents Pay even after OK`, async () => {
        const h = await preparedClient([changed, paidPage])
        const result = await h.client.confirmPurchase(86.4, async () => {}, async () => {}, accepted)
        assert.equal(result.message, 'PACKAGE_QUOTE_CHANGED')
        assert.equal(result.outcomeCategory, 'UNCERTAIN_REVIEW_REQUIRED')
        assert.equal(h.posts.length, 4)
        assert.equal(h.posts.some(post => post.has('ctl00$ContentPlaceHolder1$BtnPay')), false)
    })
}

for (const mutation of ['name', 'price', 'currency', 'quoteRevision', 'packageKey', 'appliedPromoCode', 'viewState', 'stb', 'card'] as const) {
    test(`changing ${mutation} after preparation blocks final OK`, async () => {
        const h = await preparedClient([paymentPage(), paidPage])
        const expected = structuredClone(accepted)
        if (mutation === 'viewState') h.client.currentViewState = { ...state, __VIEWSTATE: 'other' }
        else if (mutation === 'stb') h.client.currentStbNumber = 'other'
        else if (mutation === 'card') expected.cardNumber = 'other'
        else Object.assign(expected.selectedPackage, { [mutation]: mutation === 'price' ? 216 : mutation === 'quoteRevision' ? 3 : 'other' })
        const result = await h.client.confirmPurchase(expected.selectedPackage.price, async () => {}, async () => {}, expected)
        assert.equal(result.message, 'PACKAGE_QUOTE_CHANGED')
        assert.equal(h.posts.length, 3)
    })
}

test('reordered rows and obsolete client checkbox use only the fresh matching control', async () => {
    const h = purchaseClient([summary(), summary(), summary()])
    h.client.renewalSelection.packages = [{ ...selected, name: 'Together 24 Months', checkboxValue: 'wrong' },
        { ...selected, index: 7, checkboxValue: 'fresh' }]
    const result = await h.client.completePurchase({ ...selected, checkboxValue: 'wrong' }, undefined, 'synthetic-stb', true)
    assert.equal(result.awaitingConfirm, true)
    assert.equal(h.posts[0].get('fresh'), 'on')
    assert.equal(h.posts[0].has('wrong'), false)
})

test('ambiguous fresh selection stops before Add and is not retried', async () => {
    const h = purchaseClient([])
    h.client.renewalSelection.packages.push({ ...selected, index: 7, checkboxValue: 'duplicate' })
    const result = await h.client.completePurchase(selected, undefined, 'synthetic-stb', true)
    assert.equal(result.message, 'PACKAGE_QUOTE_CHANGED')
    assert.equal(h.posts.length, 0)
})

test('missing WebForms state blocks the next mutation even when cart text matches', async () => {
    const h = purchaseClient([summary().replace(hidden, ''), summary(), summary()])
    assert.equal((await h.client.completePurchase(selected, undefined, 'synthetic-stb', true)).message, 'PACKAGE_QUOTE_CHANGED')
    assert.equal(h.posts.length, 1)
})

test('an expired prepared session blocks OK without login or navigation', async () => {
    const h = await preparedClient([paymentPage(), paidPage])
    h.client.sessionExpiresAt = Date.now() - 1
    assert.equal((await h.client.confirmPurchase(86.4, async () => {}, async () => {}, accepted)).message, 'PACKAGE_QUOTE_CHANGED')
    assert.equal(h.posts.length, 3)
})

test('promo consent survives preparation only when every response retains that code', async () => {
    const quote = { ...selected, appliedPromoCode: 'SAVE' }
    const response = summary().replace('txtPromoCode" value=""', 'txtPromoCode" value="SAVE"')
    const h = purchaseClient([response, response, response])
    h.client.renewalSelection.promoCode = 'SAVE'
    assert.equal((await h.client.completePurchase(quote, undefined, 'synthetic-stb', true)).awaitingConfirm, true)
    assert.equal(h.client.preparedRenewal.summary.promoCode, 'SAVE')
    assert.ok(h.posts.every(post => post.get('ctl00$ContentPlaceHolder1$txtPromoCode') === 'SAVE'))
    assert.throws(() => purchaseGuard.readRenewalSummary(summary(), quote, fullCard), /PACKAGE_QUOTE_CHANGED/)
})

function promoResponse(name: string, amount: string, code: string) {
    const identity = observedCart(name, amount, code).replace(/<fieldset>[\s\S]*?<\/fieldset>/, '')
    return hidden + identity + `<table id="ContentPlaceHolder1_gvAvailablePackages"><tr><td><input type="checkbox" name="promo-row"></td><td><span id="pkg_lblName">${name}</span></td><td>${amount} USD</td></tr></table>`
}

for (const [label, response, successful] of [
    ['changed and echoed quote', promoResponse(selected.name, '64.80', 'SAVE'), true],
    ['unchanged quote despite echo', promoResponse(selected.name, '86.40', 'SAVE'), false],
    ['missing promo echo', promoResponse(selected.name, '64.80', ''), false],
    ['other promo echo', promoResponse(selected.name, '64.80', 'OTHER'), false],
    ['different destination', promoResponse(selected.name, '64.80', 'SAVE').replace(providerCard, '700000002'), false],
    ['login response', '<title>Login</title><input type="password">', false],
] as const) test(`promo response: ${label}`, async () => {
    const h = purchaseClient([response])
    h.client.loadPackages = async () => ({ success: false, packages: [], error: 'PROMO_REFRESH_UNVERIFIED' })
    const result = await h.client.applyPromoCode('SAVE', fullCard, 'CISCO')
    assert.equal(result.success, successful)
    assert.equal(h.posts.length, 1)
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$btnPromoCode'), 'Submit')
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$txtPromoCode'), 'SAVE')
    assert.equal(h.client.renewalSelection?.promoCode || null, successful ? 'SAVE' : null)
})

test('promo POST uses only enabled controls in the current bound form', async () => {
    const h = purchaseClient([promoResponse(selected.name, '64.80', 'SEASONOFFERS')])
    const result = await h.client.applyPromoCode('SEASONOFFERS', fullCard, 'CISCO')
    assert.equal(result.success, true)
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$ddlType'), '8')
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$tbSerial1'), providerCard)
    assert.equal(h.posts[0].get('__VIEWSTATE'), state.__VIEWSTATE)
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$txtPromoCode'), 'SEASONOFFERS')
    assert.equal(h.posts[0].has('ctl00$ContentPlaceHolder1$btnAddToCart'), false)
    assert.equal(h.posts[0].has('fresh-row'), false)
})

test('removing a promo uses the same card and WebForms page without reload', async () => {
    const h = purchaseClient([promoResponse(selected.name, '86.40', '')])
    h.client.renewalSelection.promoCode = 'SEASONOFFERS'
    h.client.renewalSelection.packages = [{ ...selected, price: 64.8 }]
    h.client.renewalSelection.formHtml = promoForm.replace(
        'name="ctl00$ContentPlaceHolder1$txtPromoCode" value=""',
        'name="ctl00$ContentPlaceHolder1$txtPromoCode" value="SEASONOFFERS"')
    h.client.loadPackages = async () => { throw new Error('FORBIDDEN_RELOAD') }
    const result = await h.client.removePromoCode(fullCard, 'CISCO')
    assert.equal(result.success, true)
    assert.equal(result.packages[0].price, 86.4)
    assert.equal(h.posts.length, 1)
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$tbSerial1'), providerCard)
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$ddlType'), '8')
    assert.equal(h.posts[0].get('ctl00$ContentPlaceHolder1$txtPromoCode'), '')
})

test('a changed promo offer name remains the new quote identity even at the old price', async () => {
    const renamed = 'Premium 6 Months + 25% OFF (6 Months)'
    const h = purchaseClient([promoResponse(renamed, '86.40', 'SEASONOFFERS')])
    const result = await h.client.applyPromoCode('SEASONOFFERS', fullCard, 'CISCO')
    assert.equal(result.success, true)
    assert.equal(result.packages[0].name, renamed)
    assert.throws(() => matchFreshPackage(result.packages, selected), /PACKAGE_QUOTE_CHANGED/)
})

for (const [label, form] of [
    ['old viewstate', promoForm.replace(state.__VIEWSTATE, 'old-state')],
    ['duplicate viewstate', promoForm.replace(`name="__VIEWSTATE" value="${state.__VIEWSTATE}">`,
        `name="__VIEWSTATE" value="${state.__VIEWSTATE}"><input name="__VIEWSTATE" value="${state.__VIEWSTATE}">`)],
    ['other card', promoForm.replace(providerCard, '700000002')],
    ['other type', promoForm.replace('option value="8" selected', 'option value="8"')],
    ['missing submit', promoForm.replace('btnPromoCode', 'missingPromoButton')],
    ['selected old row', promoForm.replace('name="fresh-row"', 'name="fresh-row" checked')],
] as const) test(`promo form ${label} stops before provider POST`, async () => {
    const h = purchaseClient([])
    h.client.renewalSelection.formHtml = form
    assert.equal((await h.client.applyPromoCode('SEASONOFFERS', fullCard, 'CISCO')).success, false)
    assert.equal(h.posts.length, 0)
})

test('expired selection cannot Add and a changed promo context cannot Submit', async () => {
    const expired = purchaseClient([])
    expired.client.sessionExpiresAt = Date.now() - 1
    assert.equal((await expired.client.completePurchase(selected, undefined, 'synthetic-stb', true)).success, false)
    assert.equal(expired.posts.length, 0)
    const wrongContext = purchaseClient([])
    assert.equal((await wrongContext.client.applyPromoCode('SAVE', fullCard, 'IRDETO')).success, false)
    assert.equal(wrongContext.posts.length, 0)
})

for (const [stage, field] of [[0, 'btnSell'], [1, 'tbStbSerial2'], [2, 'btnStbOk'], [3, 'BtnPay'], [3, 'Epay']] as const) {
    test(`a matching cart without the next stage control ${field} cannot proceed`, async () => {
        const responses = [summary(), summary(), summary(), paymentPage(), paidPage]
        responses[stage] = responses[stage].replace(`$${field}"`, '$unsupported"')
        const h = purchaseClient(responses)
        const prepared = await h.client.completePurchase(selected, undefined, 'synthetic-stb', true)
        if (stage === 3) {
            assert.equal(prepared.awaitingConfirm, true)
            assert.equal((await h.client.confirmPurchase(86.4, async () => {}, async () => {}, accepted)).message, 'PACKAGE_QUOTE_CHANGED')
        } else assert.equal(prepared.message, 'PACKAGE_QUOTE_CHANGED')
        assert.equal(h.posts.length, stage + 1)
    })
}

test('a concurrent/replayed confirmation sends exactly one OK and one Pay', async () => {
    const h = await preparedClient([paymentPage(), paidPage])
    let claims = 0
    const confirm = () => h.client.confirmPurchase(86.4, async () => { claims++ }, async () => {}, accepted)
    const results = await Promise.all([confirm(), confirm()])
    assert.equal(results.filter(result => result.success).length, 1)
    assert.equal(claims, 1)
    assert.equal(h.posts.filter(post => post.has('ctl00$ContentPlaceHolder1$btnStbOk')).length, 1)
    assert.equal(h.posts.filter(post => post.has('ctl00$ContentPlaceHolder1$BtnPay')).length, 1)
    assert.equal((await confirm()).success, false)
    assert.equal(h.posts.length, 5)
})

test('matching simulated purchase needs a new report invoice and the exact active contract', async () => {
    const h = await preparedClient([paymentPage(), paidPage])
    const result = await h.client.confirmPurchase(86.4, async () => {}, async () => {}, accepted)
    assert.equal(result.success, true)
    assert.equal(Math.round((result.beinBalanceBefore - result.beinBalanceAfter) * 100), 8640)
    const input = {
        baseline: { outcome: 'COMPLETE' as const, invoiceNos: [], dealerContextHash: 'synthetic-dealer', capturedAt: '2026-10-11T11:59:00Z' },
        postReport: { outcome: 'COMPLETE' as const, dealerContextHash: 'synthetic-dealer', observedAt: '2026-10-11T12:01:00Z', rows: [{
            invoiceNo: 'synthetic-new', cardNumber: accepted.cardNumber, itemType: 'Card_CISCO', packageName: selected.name,
            contractStartDate: '11/10/2026', contractExpiryDate: '10/04/2027', providerAmount: '86.40', currency: 'USD', rowFingerprint: 'a'.repeat(64) }] },
        contractCheck: { outcome: 'COMPLETE' as const, observedAt: '2026-10-11T12:01:05Z', contracts: [{ type: 'Package', status: 'Active',
            package: selected.name, startDate: '11/10/2026', expiryDate: '10/04/2027', invoiceNo: 'synthetic-new' }] },
        target: { cardNumber: accepted.cardNumber, itemType: 'Card_CISCO', selectedPackageName: selected.name, providerAmount: '86.40',
            currency: 'USD', finalMutationStartedAt: '2026-10-11T12:00:00Z' },
    }
    assert.equal(correlateRenewalFulfillment(input).outcome, 'MATCHED')
    input.contractCheck.contracts[0].package = 'Premium 24 Months'
    assert.notEqual(correlateRenewalFulfillment(input).outcome, 'MATCHED')
    input.contractCheck.contracts[0].package = selected.name
    input.postReport.rows[0].packageName = 'Premium 6 Months + 25% OFF (6 Months)'
    assert.notEqual(correlateRenewalFulfillment(input).outcome, 'MATCHED')
    input.postReport.rows[0].packageName = selected.name
    input.contractCheck.contracts[0].invoiceNo = 'unrelated'
    assert.notEqual(correlateRenewalFulfillment(input).outcome, 'MATCHED')
})

// Synthetic HTML, not captured provider markup. Proves isolation from unrelated grids.
test('available packages never include another grid even when it has more rows', () => {
    const row = (name: string) => `<tr class="GridRow"><td><input type="checkbox" name="${name}"></td><td><span id="${name}_lblName">${name} 6 Months</span></td><td>86.40 USD</td></tr>`
    const client = Object.create(httpPrototype())
    const parsed = client.extractPackagesFromHtml(cheerio.load(`<table id="ContentPlaceHolder1_gvAvailablePackages">${row('Premium')}</table><table>${row('Other')}${row('Third')}</table>`))
    assert.deepEqual(Array.from(parsed, (pkg: { name: string }) => pkg.name), ['Premium 6 Months'])
})

test('a currency change cannot reuse the selected package', () => {
    const selected = { index: 0, name: 'Premium 6 Months', price: 86.4, currency: 'USD', checkboxValue: 'old' }
    assert.throws(() => matchFreshPackage([{ ...selected, currency: 'EUR' }], selected), /PACKAGE_QUOTE_CHANGED/)
})

for (const selectedPackageName of ['Premium 24 Months + 20% OFF (24 Months)', 'Premium 6 Months + 20% OFF (6 Months)']) {
    test(`legacy proof cannot match Premium 6 Months to ${selectedPackageName}`, () => {
        assert.equal(findMatchingRenewalContract({ selectedPackageName, referenceDate: new Date('2026-10-11T12:00:00Z'),
            contracts: [{ type: 'Package', status: 'Active', package: 'Premium 6 Months', startDate: '11/10/2026',
                expiryDate: '10/04/2027', invoiceNo: 'synthetic-invoice' }] }), null)
    })
}
