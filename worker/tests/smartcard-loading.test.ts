import test from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as guard from '../src/http/renewal-purchase-guard'
import * as quote from '../../shared/operations/package-quote'
import { observedPackages, observedSmartcardForm } from './fixtures/smartcard-observed'

const field = 'ctl00$ContentPlaceHolder1$'
const hidden = '<input id="__VIEWSTATE" name="__VIEWSTATE" value="synthetic-state"><input id="__EVENTVALIDATION" name="__EVENTVALIDATION" value="synthetic-validation">'
function form(label: string, value: string, serial = '7', confirm = false, packages = false) {
    return `${hidden}<select id="ContentPlaceHolder1_ddlType" name="${field}ddlType">
        <option value="0">Select</option><option value="${value}" selected>${label}</option></select>
        <input name="${field}tbSerial1" value="${serial}" maxlength="${value === '8' ? '9' : '16'}">
        <input type="submit" name="${field}btnLoad1" value="Load">
        ${confirm ? `<input name="${field}tbSerial2"><input type="submit" name="${field}btnLoad2" value="Load">` : ''}
        ${packages ? `<table id="ContentPlaceHolder1_gvAvailablePackages"><tr><th></th><th>Package Name</th><th>Full Price</th></tr>
        <tr><td><input type="checkbox" name="${field}gvAvailablePackages$ctl02$cbSelect">
        </td><td><span id="ContentPlaceHolder1_gvAvailablePackages_lblName_0">Premium 6 Months</span></td><td>108 USD</td></tr></table>` : ''}`
}

function clientFor(responses: string[], logs?: string[]) {
    const posts: URLSearchParams[] = []
    const next = () => { assert.ok(responses.length, 'unexpected provider request'); return { data: responses.shift()! } }
    const transport = { get: async () => next(), post: async (_url: string, body: string) => {
        posts.push(new URLSearchParams(body)); return next()
    } }
    const dependencies: Record<string, unknown> = {
        cheerio, './renewal-purchase-guard': guard, '../../../shared/operations/package-quote': quote,
    }
    for (const name of ['axios', 'axios-retry', 'axios-cookiejar-support', 'tough-cookie', 'https', '../lib/prisma',
        '../utils/totp-generator', '../utils/proxy-manager', 'http-cookie-agent/http', 'socks-proxy-agent', 'https-proxy-agent',
        './webforms-form', './sold-packages-report', '../../../shared/operations/renewal-fulfillment-config']) dependencies[name] = {}
    dependencies.axios = { default: { create: () => transport } }
    dependencies['axios-retry'] = { default: () => {} }
    dependencies['axios-cookiejar-support'] = { wrapper: (value: unknown) => value }
    class SyntheticCookieJar {
        static async deserialize() { return new SyntheticCookieJar() }
        async serialize() { return { cookies: [] } }
    }
    dependencies['tough-cookie'] = { CookieJar: SyntheticCookieJar }
    const prototype = loadIsolatedModule<{ HttpClientService: { prototype: object } }>(
        'worker/src/http/HttpClientService.ts', dependencies, [], {}, logs ? { console: {
            log: (...parts: unknown[]) => logs.push(parts.join(' ')), info: (...parts: unknown[]) => logs.push(parts.join(' ')),
            warn: (...parts: unknown[]) => logs.push(parts.join(' ')), error: (...parts: unknown[]) => logs.push(parts.join(' ')),
        } } : {}).HttpClientService.prototype
    const client = Object.assign(Object.create(prototype), {
        config: { renewUrl: '/renew', checkUrl: '/check' }, currentStbNumber: null,
        accountId: 'synthetic-account', jar: new SyntheticCookieJar(),
        buildFullUrl: (path: string) => `https://synthetic.invalid${path}`, buildPostHeaders: () => ({}),
        axios: transport,
    })
    // The test controls authentication independently; all HTTP is mocked.
    client.checkForSessionExpiry = (html: string) => html.includes('NLogin.aspx') ? 'Session expired' : null
    client.checkForErrors = () => null
    return { client, posts }
}

test('CISCO prefixed type label loads only the requested type through both serial steps', async () => {
    const html = form('Smartcard: CISCO', '8')
    const h = clientFor([html, html, form('Smartcard: CISCO', '8', '7XXXXXXXX', true),
        form('Smartcard: CISCO', '8', '700000000', false, true)])
    const result = await h.client.loadPackages('7000000001', 'CISCO')
    assert.equal(result.success, true, result.error)
    assert.equal(h.posts.length, 3)
    assert.equal(h.posts[0].get(field + 'ddlType'), '8')
    assert.equal(h.posts[1].get(field + 'tbSerial1'), '700000000')
    assert.equal(h.posts[1].has(field + 'tbSerial2'), false)
    assert.equal(h.posts[2].get(field + 'tbSerial2'), '700000000')
    assert.equal(h.posts.some(post => [...post.keys()].some(key => /btnSell|BtnPay|btnAdd/i.test(key))), false)
})

test('live-shaped disabled confirmation controls preserve identity and all fourteen package rows', async () => {
    const h = clientFor(['initial', 'selected', 'confirm', 'packages'].map(stage =>
        observedSmartcardForm(stage as Parameters<typeof observedSmartcardForm>[0])))
    const result = await h.client.loadPackages('7000000001', 'CISCO')
    assert.equal(result.success, true, result.error)
    assert.equal(h.posts.length, 3)
    assert.deepEqual(Array.from(result.packages, (pkg: { name: string; price: number }) => [pkg.name, pkg.price]), observedPackages)
    assert.equal(result.packages[4].checkboxValue, field + 'gvAvailablePackages$ctl06$cbSelect')
    assert.equal(result.packages[4].name, 'Premium 3 Months (3 Months)')
    assert.equal(result.packages[4].price, 54)
    assert.equal(h.posts[2].get(field + 'tbSerial2'), '700000000')
    assert.equal(h.posts[2].get(field + 'btnLoad2'), 'Load')
    // Native browser POST omits disabled controls; their identity is checked in the response.
    assert.equal(h.posts[2].has(field + 'ddlType'), false)
    assert.equal(h.posts[2].has(field + 'tbSerial1'), false)
    assert.equal(h.posts[2].get('__VIEWSTATE'), 'synthetic-confirm')
    assert.equal(h.posts.some(post => [...post.keys()].some(key => /btnSell|BtnPay|btnAdd/i.test(key))), false)
})

for (const crossWorker of [false, true]) test(`actual package loader can submit a changing promo ${crossWorker ? 'after worker handoff' : 'on the same worker'} without inventing absent optional hidden controls`, async () => {
    const loadedForm = observedSmartcardForm('packages')
    const promoForm = loadedForm.replace('name="ctl00$ContentPlaceHolder1$txtPromoCode" value=""',
        'name="ctl00$ContentPlaceHolder1$txtPromoCode" value="DYNAMIC-OFFER"')
        .replace('Together 3 Months (3 Months)', 'Together 3 Months + seasonal offer (3 Months)')
        .replace('27&nbsp;USD', '24.30&nbsp;USD')
    const h = clientFor([
        ...['initial', 'selected', 'confirm'].map(stage => observedSmartcardForm(stage as Parameters<typeof observedSmartcardForm>[0])),
        loadedForm, promoForm,
    ])
    assert.equal((await h.client.loadPackages('7000000001', 'CISCO')).success, true)

    const target = crossWorker ? clientFor([promoForm]) : h
    if (crossWorker) await target.client.importSession(JSON.parse(JSON.stringify(await h.client.exportSession())))
    const result = await target.client.applyPromoCode('DYNAMIC-OFFER', '7000000001', 'CISCO')
    assert.equal(result.success, true, result.error)
    assert.equal(result.packages[0].name, 'Together 3 Months + seasonal offer (3 Months)')
    assert.equal(result.packages[0].price, 24.3)
    const allPosts = crossWorker ? [...h.posts, ...target.posts] : h.posts
    assert.equal(allPosts.length, 4)
    const post = allPosts[3]
    assert.equal(post.get(field + 'btnPromoCode'), 'Submit')
    assert.equal(post.get(field + 'txtPromoCode'), 'DYNAMIC-OFFER')
    assert.equal(post.has('__LASTFOCUS'), false)
    assert.equal(post.has('__VIEWSTATEGENERATOR'), false)
    assert.equal(post.has(field + 'ddlType'), false)
    assert.equal(post.has(field + 'tbSerial1'), false)
    assert.equal(allPosts.some(body => [...body.keys()].some(key => /btnSell|BtnPay|btnAdd/i.test(key))), false)
})

test('promo rejects stale optional state and logs only the fixed reason and field name', async () => {
    const logs: string[] = []
    const h = clientFor([], logs)
    const html = observedSmartcardForm('packages')
    const state = h.client.extractHiddenFields(html)
    state.__LASTFOCUS = 'PRIVATE_STALE_FOCUS'
    h.client.currentViewState = state
    h.client.renewalSelection = { packages: [], viewState: state, cardNumber: '7000000001',
        smartcardType: 'CISCO', promoCode: null, formHtml: html }
    const result = await h.client.applyPromoCode('PRIVATE_PROMO', '7000000001', 'CISCO')
    assert.equal(result.success, false)
    assert.equal(result.failureStage, 'PRE_SUBMIT')
    assert.equal(result.failureReason, 'WEBFORMS_STATE_MISMATCH')
    assert.equal(result.providerPostSent, false)
    assert.equal(h.posts.length, 0)
    const diagnostics = logs.filter(line => line.includes('Promo validation stopped:')).join('\n')
    assert.match(diagnostics, /WEBFORMS_STATE_MISMATCH/)
    assert.match(diagnostics, /__LASTFOCUS/)
    assert.doesNotMatch(diagnostics, /PRIVATE_STALE_FOCUS|PRIVATE_PROMO|7000000001|synthetic-validation/)
})

test('promo preserves optional hidden controls when the actual page includes them', () => {
    const h = clientFor([])
    const html = observedSmartcardForm('packages').replace('</form>',
        '<input id="__LASTFOCUS" name="__LASTFOCUS" value="synthetic-focus">' +
        '<input id="__VIEWSTATEGENERATOR" name="__VIEWSTATEGENERATOR" value="synthetic-generator"></form>')
    const state = h.client.extractHiddenFields(html)
    const post = guard.buildPromoSubmission(html, state, '7000000001', 'CISCO', 'DYNAMIC')
    assert.equal(post.get('__LASTFOCUS'), 'synthetic-focus')
    assert.equal(post.get('__VIEWSTATEGENERATOR'), 'synthetic-generator')
})

for (const [label, mutate] of [
    ['required state missing', (html: string) => html.replace(/<input id="__EVENTVALIDATION"[^>]*>/, '')],
    ['required state changed', (html: string) => html.replace('synthetic-validation-packages', 'other-state')],
    ['duplicate optional state', (html: string) => html.replace('</form>', '<input name="__LASTFOCUS" value=""><input name="__LASTFOCUS" value=""></form>')],
] as const) test(`promo still rejects ${label} before its HTTP request`, () => {
    const h = clientFor([])
    const html = observedSmartcardForm('packages')
    const state = h.client.extractHiddenFields(html)
    assert.throws(() => guard.buildPromoSubmission(mutate(html), state, '7000000001', 'CISCO', 'DYNAMIC'),
        guard.PromoValidationError)
    assert.equal(h.posts.length, 0)
})

for (const [type, value, label, card, serial] of [
    ['CISCO', '8', 'CISCO', '7000000001', '700000000'],
    ['CISCO', '8', '  Smartcard:  CISCO  ', '7000000001', '700000000'],
    ['IRDETO', '1', 'Irdeto', '123456789012', '123456789012'],
    ['IRDETO', '1', 'Smartcard: Irdeto', '123456789012', '123456789012'],
]) {
    test(`loading ${label} preserves current ${type} serial mapping and fresh form state`, async () => {
        const html = form(label, value).replace('id="ContentPlaceHolder1_ddlType" ', '')
        const selected = html.replace('synthetic-state', 'selected-state')
        const confirmation = form(label, value, 'masked', true).replace('synthetic-state', 'confirmation-state')
        const h = clientFor([html, selected, confirmation, form(label, value, serial, false, true)])
        const result = await h.client.loadPackages(card, type)
        assert.equal(result.success, true, result.error)
        assert.equal(h.posts[0].get(field + 'ddlType'), value)
        assert.equal(h.posts[1].get(field + 'tbSerial1'), serial)
        assert.equal(h.posts[2].get(field + 'tbSerial2'), serial)
        assert.equal(h.posts[1].get('__VIEWSTATE'), 'selected-state')
        assert.equal(h.posts[2].get('__VIEWSTATE'), 'confirmation-state')
        assert.equal(h.posts.length, 3)
    })
}

for (const [name, change] of [
    ['missing dropdown', (html: string) => html.replaceAll('ddlType', 'anotherControl')],
    ['duplicate dropdown', (html: string) => html + html],
    ['wrong type', (html: string) => html.replace('>CISCO<', '>Irdeto<')],
    ['substring label', (html: string) => html.replace('>CISCO<', '>Not CISCO<')],
    ['mixed type label', (html: string) => html.replace('>CISCO<', '>CISCO / IRDETO<')],
    ['report-only label', (html: string) => html.replace('>CISCO<', '>Card_CISCO<')],
    ['wrong value', (html: string) => html.replace('value="8"', 'value="1"')],
    ['empty value', (html: string) => html.replace('value="8"', 'value=""')],
    ['duplicate type', (html: string) => html.replace('</select>', '<option value="9">Smartcard: CISCO</option></select>')],
    ['duplicate value', (html: string) => html.replace('</select>', '<option value="8">Irdeto</option></select>')],
    ['disabled type', (html: string) => html.replace('value="8" selected', 'value="8" selected disabled')],
] as const) {
    test(`${name} stops before the first type POST`, async () => {
        const h = clientFor([change(form('CISCO', '8'))])
        const result = await h.client.loadPackages('7000000001', 'CISCO')
        assert.equal(result.error, 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED')
        assert.equal(h.posts.length, 0)
    })
}

test('reordered type options never substitute IRDETO for CISCO', () => {
    const html = `<select name="${field}ddlType"><option value="1">Smartcard: Irdeto</option>
        <option value="8">Smartcard: CISCO</option></select>`
    assert.equal(guard.readProviderSmartcardOption(cheerio.load(html), 'CISCO').value, '8')
    assert.equal(guard.readProviderSmartcardOption(cheerio.load(html), 'IRDETO').value, '1')
})

test('type changed by the postback stops before sending the serial', async () => {
    const h = clientFor([form('CISCO', '8'), form('Irdeto', '1')])
    assert.equal((await h.client.loadPackages('7000000001', 'CISCO')).error, 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED')
    assert.equal(h.posts.length, 1)
})

test('session expiry on type selection invalidates the session before serial submission', async () => {
    const h = clientFor([form('CISCO', '8'), '<form action="NLogin.aspx"></form>'])
    let invalidated = false
    h.client.invalidateSession = () => { invalidated = true }
    assert.equal((await h.client.loadPackages('7000000001', 'CISCO')).error, 'Session expired')
    assert.equal(invalidated, true)
    assert.equal(h.posts.length, 1)
})

test('an unsupported IRDETO field length stops without trimming the card speculatively', async () => {
    const html = form('Irdeto', '1').replace('maxlength="16"', 'maxlength="9"')
    const h = clientFor([html, html])
    assert.equal((await h.client.loadPackages('123456789012', 'IRDETO')).error, 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED')
    assert.equal(h.posts.length, 1)
})

test('a changed type on confirmation cannot submit the second serial', async () => {
    const html = form('CISCO', '8')
    const h = clientFor([html, html, form('Irdeto', '1', 'masked', true)])
    assert.equal((await h.client.loadPackages('7000000001', 'CISCO')).error, 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED')
    assert.equal(h.posts.length, 2)
})

test('a returned different card still fails the identity guard after loading', async () => {
    const html = form('CISCO', '8')
    const h = clientFor([html, html, form('CISCO', '8', '700000009', false, true)])
    assert.equal((await h.client.loadPackages('7000000001', 'CISCO')).error, 'Load failed: PACKAGE_QUOTE_CHANGED')
    assert.equal(h.posts.length, 2)
})
