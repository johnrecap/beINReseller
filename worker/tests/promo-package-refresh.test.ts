import test from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { OperationStatus } from '@prisma/client'
import * as packageQuote from '../../shared/operations/package-quote'
import * as purchaseGuard from '../src/http/renewal-purchase-guard'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import { matchFreshPackage, isCurrentPromo, promoResultData, refreshPromoPackages } from '../src/lib/promo-quote'

const selected = { index: 0, name: 'Synthetic 12 months', price: 200, checkboxValue: 'old-row' }
test('actual orchestrator retries promo reservation failure without financial closure', async () => {
    const financialCalls: string[] = []
    const deps: Record<string, unknown> = {
        '@prisma/client': { OperationStatus },
        '../../shared/operations/package-quote': packageQuote,
        './lib/promo-quote': { isCurrentPromo },
        './lib/prisma': { prisma: {
            operation: { findUnique: async () => ({ status: 'AWAITING_PACKAGE', cardNumber: 'synthetic-card', beinAccountId: 'synthetic-account',
                responseData: { quoteRevision: 1, refreshing: true, requestedPromoCode: 'CODE' } }) },
            beinAccount: { findUnique: async () => { throw new Error('SYNTHETIC_RESERVATION_FAILURE') } },
        } },
        './utils/error-handler': { refundUser: () => financialCalls.push('refund'), markOperationFailed: () => financialCalls.push('failure') },
    }
    for (const name of ['node:crypto', 'bullmq', './http', './pool', './pool/account-locking', './utils/notification',
        './utils/captcha-solver', './lib/activity-tracker', './lib/integrity-detector', './lib/crypto', './lib/bein-spend-ledger',
        './lib/installment-finalization', '../../shared/operations/audit-financial-context', '../../shared/operations/completion-effects', './lib/redis', './lib/points',
        './lib/session-cache', './lib/package-cache', './lib/bein-login-tracking', './lib/bein-connection-mode',
        './lib/final-pay-evidence', './lib/fulfillment-finalization', './lib/renewal-no-charge-finalization',
        './lib/pre-mutation-renewal-finalization', './lib/renewal-verification-retry', './lib/fulfillment-baseline',
        './lib/same-day-report-fulfillment', '../../shared/operations/financial-lock',
        './lib/provider-account-reservation', './lib/renewal-fulfillment-correlation', '../../shared/operations/renewal-fulfillment']) {
        deps[name] = new Proxy({}, { get: (_target, key) => () => { financialCalls.push(`${name}:${String(key)}`); throw new Error('UNEXPECTED_DEPENDENCY') } })
    }
    const api = loadIsolatedModule<{ processOperationHttp: (job: unknown, pool: unknown) => Promise<void> }>('worker/src/http-queue-processor.ts', deps)
    await assert.rejects(api.processOperationHttp({ data: { operationId: 'synthetic', type: 'APPLY_PROMO',
        actionRevision: 1, cardNumber: 'synthetic-card', promoCode: 'CODE' } }, {}), /SYNTHETIC_RESERVATION_FAILURE/)
    assert.deepEqual(financialCalls, [])
})
test('rematching uses fresh controls and tolerates only normalized display spelling', () => {
    const fresh = { ...selected, index: 4, name: ' SYNTHETIC  12 months ', checkboxValue: 'new-row' }
    assert.equal(matchFreshPackage([fresh], selected).checkboxValue, 'new-row')
})
for (const scenario of ['rename', 'price', 'missing', 'duplicate'] as const) {
    test(`provider ${scenario} drift blocks selection instead of using an index or similar name`, () => {
        const fresh = scenario === 'missing' ? [] : scenario === 'duplicate' ? [selected, { ...selected, index: 1 }]
            : [{ ...selected, ...(scenario === 'rename' ? { name: 'Another package 12 months' } : { price: 201 }) }]
        assert.throws(() => matchFreshPackage(fresh, selected), /PACKAGE_QUOTE_CHANGED/)
    })
}
test('only the current pending promo can publish, including failure and duplicate completion', () => {
    const op = { status: 'AWAITING_PACKAGE', promoCode: null, responseData: { quoteRevision: 2, quoteState: 'PENDING',
        refreshing: true, requestedPromoCode: 'SECOND', promoAction: 'APPLY' } }
    assert.equal(isCurrentPromo(op, 1, 'FIRST', 'APPLY'), false)
    assert.equal(isCurrentPromo(op, 2, 'SECOND', 'APPLY'), true)
    assert.equal(isCurrentPromo({ ...op, status: 'COMPLETING' }, 2, 'SECOND', 'APPLY'), false)
    assert.equal(isCurrentPromo({ ...op, responseData: { ...op.responseData, quoteState: 'READY', refreshing: false } }, 2, 'SECOND', 'APPLY'), false)
    const failed = promoResultData(op.responseData, [], 2, 'SECOND', false)
    assert.equal(failed.quoteState, 'FAILED')
    assert.equal(failed.refreshing, false)
    assert.equal(failed.promoApplied, false)
})

test('explicit removal matches pending null while the previously applied code remains stored', () => {
    assert.equal(isCurrentPromo({ status: 'AWAITING_PACKAGE', promoCode: 'APPLIED', responseData: {
        quoteRevision: 3, refreshing: true, promoAction: 'REMOVE', requestedPromoCode: null,
    } }, 3, undefined, 'REMOVE'), true)
})

test('failed promo retains its diagnostic reason without treating a pre-submit failure as a provider request', () => {
    const failed = promoResultData({}, [], 1, 'DYNAMIC', false, {
        error: 'PROMO_REFRESH_UNVERIFIED', failureStage: 'PRE_SUBMIT',
        failureReason: 'WEBFORMS_STATE_MISMATCH', providerPostSent: false,
    })
    assert.equal(failed.quoteState, 'FAILED')
    assert.equal('promoFailureReason' in failed && failed.promoFailureReason, 'WEBFORMS_STATE_MISMATCH')
    assert.equal('promoProviderPostSent' in failed && failed.promoProviderPostSent, false)
})

test('promo refresh preserves IRDETO context, fences both requests and removes only by explicit action', async () => {
    const calls: unknown[] = []
    const client = {
        loadPackages: async (card: string, type: string) => { calls.push(['load', card, type]); return { success: true, packages: [selected] } },
        applyPromoCode: async (code: string, card: string, type: string) => { calls.push(['apply', code, card, type]); return { success: true, packages: [selected] } },
    }
    const fence = async () => { calls.push('fence') }
    await refreshPromoPackages(client, { cardNumber: 'synthetic-card', smartcardType: 'IRDETO', promoAction: 'APPLY', promoCode: 'NEW' }, fence)
    assert.deepEqual(calls, ['fence', ['load', 'synthetic-card', 'IRDETO'], 'fence', ['apply', 'NEW', 'synthetic-card', 'IRDETO']])
    calls.length = 0
    await refreshPromoPackages(client, { cardNumber: 'synthetic-card', smartcardType: 'IRDETO', promoAction: 'REMOVE' }, fence)
    assert.deepEqual(calls, ['fence', ['load', 'synthetic-card', 'IRDETO']])
})

test('v2 promo changes the current card-bound page without a package reload', async () => {
    const calls: string[] = []
    const client = {
        loadPackages: async () => { calls.push('reload'); throw new Error('FORBIDDEN_RELOAD') },
        applyPromoCode: async (_code: string, _card: string, _type: string,
            assertCurrent?: () => Promise<void>) => {
            await assertCurrent?.(); calls.push('apply');
            return { success: true, packages: [selected] }
        },
        removePromoCode: async (_card: string, _type: string,
            assertCurrent?: () => Promise<void>) => {
            await assertCurrent?.(); calls.push('remove');
            return { success: true, packages: [selected] }
        },
    }
    const fence = async () => { calls.push('fence') }
    await refreshPromoPackages(client, { cardNumber: 'synthetic-card', smartcardType: 'CISCO',
        promoAction: 'APPLY', promoCode: 'NEW', reuseCurrentPage: true }, fence)
    await refreshPromoPackages(client, { cardNumber: 'synthetic-card', smartcardType: 'CISCO',
        promoAction: 'REMOVE', reuseCurrentPage: true }, fence)
    assert.deepEqual(calls, ['fence', 'fence', 'apply', 'fence', 'fence', 'remove'])
})

test('actual HTTP promo failure never reloads or certifies an ordinary list', async () => {
    const deps: Record<string, unknown> = { cheerio, './renewal-purchase-guard': purchaseGuard,
        '../../../shared/operations/package-quote': packageQuote }
    for (const name of ['axios', 'axios-retry', 'axios-cookiejar-support', 'tough-cookie', 'https', '../lib/prisma',
        '../utils/totp-generator', '../utils/proxy-manager', 'http-cookie-agent/http', 'socks-proxy-agent', 'https-proxy-agent',
        './webforms-form', './sold-packages-report', '../../../shared/operations/renewal-fulfillment-config']) deps[name] = {}
    const { HttpClientService } = loadIsolatedModule<{ HttpClientService: { prototype: object } }>('worker/src/http/HttpClientService.ts', deps)
    const calls: unknown[] = []
    const card = '7000000000'
    const state = { __VIEWSTATE: 'synthetic-state', __VIEWSTATEGENERATOR: 'generator', __EVENTVALIDATION: 'validation' }
    const formHtml = `<form>${Object.entries(state).map(([name, value]) =>
        `<input name="${name}" value="${value}">`).join('')}
        <select name="ctl00$ContentPlaceHolder1$ddlType"><option value="1" selected>Smartcard: Irdeto</option></select>
        <input name="ctl00$ContentPlaceHolder1$tbSerial1" value="${card}">
        <table id="ContentPlaceHolder1_gvAvailablePackages"><tr><td><input type="checkbox" name="old-row"></td></tr></table>
        <input name="ctl00$ContentPlaceHolder1$txtPromoCode" value="">
        <input type="submit" name="ctl00$ContentPlaceHolder1$btnPromoCode" value="Submit"></form>`
    const client = Object.assign(Object.create(HttpClientService.prototype), {
        config: { renewUrl: '/synthetic' }, currentViewState: state,
        renewalSelection: { packages: [selected], viewState: state, cardNumber: card, smartcardType: 'IRDETO',
            promoCode: null, formHtml },
        buildFullUrl: () => 'http://synthetic.invalid', buildFormData: () => '', buildPostHeaders: () => ({}),
        checkForErrors: () => null, extractHiddenFields: () => ({}),
        axios: { post: async () => ({ data: '<html><body>Intermediate response</body></html>' }) },
        loadPackages: async (...args: unknown[]) => { calls.push(args); return { success: true, packages: [selected] } },
    })
    const result = await client.applyPromoCode('SYNTHETIC', card, 'IRDETO')
    assert.equal(result.success, false)
    assert.equal(result.error, 'PROMO_REFRESH_UNVERIFIED')
    assert.deepEqual(calls, [])
})
