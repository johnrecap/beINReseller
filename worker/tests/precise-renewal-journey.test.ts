import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as cheerio from 'cheerio'
import { OperationStatus, Prisma } from '@prisma/client'
import { loadIsolatedModule, loadPanelConfirmation } from '../../tests/helpers/promo-dispatch-harness'
import * as quote from '../../shared/operations/package-quote'
import * as price from '../../shared/operations/provider-price'
import * as identity from '../src/lib/report-package-identity'
import * as guard from '../src/http/renewal-purchase-guard'
import * as reports from '../src/http/sold-packages-report'
import * as forms from '../src/http/webforms-form'
import * as reportConfig from '../../shared/operations/renewal-fulfillment-config'
import { projectRenewalReceipt } from '../../src/lib/operations/receipt'
import type * as fulfillment from '../src/lib/same-day-report-fulfillment'
import { observedCart, observedReport, fullCard } from './fixtures/renewal-observed'
import { observedSmartcardForm } from './fixtures/smartcard-observed'

const field = 'ctl00$ContentPlaceHolder1$'
const hidden = '<input id="__VIEWSTATE" name="__VIEWSTATE" value="private-state"><input id="__EVENTVALIDATION" name="__EVENTVALIDATION" value="private-validation">'
const stb = '947242535522003'
const httpPath = 'worker/src/http/HttpClientService.ts'
const fulfillmentPath = 'worker/src/lib/same-day-report-fulfillment.ts'
const dependencies = (path: string) => Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))

// Every HTTP request consumes a supplied HTML response. No network client or
// database is constructed; cookie snapshots are JSON-round-tripped like Redis.
function worker(htmlResponses: (string | Error)[]) {
    const requests: { method: string; url: string; body: URLSearchParams }[] = []
    const next = (method: string, url: string, body = '') => {
        requests.push({ method, url, body: new URLSearchParams(body) })
        assert.ok(htmlResponses.length, `unexpected ${method} ${url}`)
        const response = htmlResponses.shift()!
        if (response instanceof Error) throw response
        return { data: response }
    }
    const transport = { get: async (url: string) => next('GET', url), post: async (url: string, body: string) => next('POST', url, body) }
    class Jar {
        static async deserialize() { return new Jar() }
        async serialize() { return { cookies: [] } }
    }
    const deps = { ...dependencies(httpPath), cheerio,
        axios: { default: { create: () => transport } }, 'axios-retry': { default: () => {} },
        'axios-cookiejar-support': { wrapper: (value: unknown) => value }, 'tough-cookie': { CookieJar: Jar },
        './renewal-purchase-guard': guard, './sold-packages-report': reports, './webforms-form': forms,
        '../../../shared/operations/package-quote': quote, '../../../shared/operations/renewal-fulfillment-config': reportConfig }
    const prototype = loadIsolatedModule<{ HttpClientService: { prototype: object } }>(httpPath, deps).HttpClientService.prototype
    const client = Object.assign(Object.create(prototype), {
        accountId: 'synthetic-account', jar: new Jar(), axios: transport,
        config: { checkUrl: '/check', renewUrl: '/renew', loginUrl: 'https://synthetic.invalid/login',
            soldPackagesReportUrl: '/report' },
        buildFullUrl: (path: string) => `https://synthetic.invalid${path}`, buildPostHeaders: () => ({}),
        checkForSessionExpiry: () => null, checkForErrors: () => null,
        sessionValid: true, sessionExpiresAt: Date.now() + 60_000,
    })
    return { client, requests }
}

function salePage(name: string, amount: string, promo: string) {
    return hidden + observedCart(name, amount, promo) + `
        <input type="submit" name="${field}btnSell" value="Sell">
        <input name="${field}tbStbSerial1" value="${stb}"><input name="${field}tbStbSerial2" value="${stb}">
        <input type="submit" name="${field}btnStbOk" value="Ok">
        <input type="submit" name="${field}BtnPay" value="Pay"><input type="radio" name="${field}Epay" value="RbdDirectPay">`
}

function reportHtml(name: string, amount: string) {
    return observedReport().replace('Add Premium 6 Months', `Add ${name}`).replace('<td>108</td>', `<td>${amount}</td>`)
        .replaceAll('$txtDate" value=""', '$txtDate" value="13/10/2026"')
}

function database(selected: quote.QuotePackage, row: reports.SoldReportSafeRow) {
    const submittedAt = new Date('2026-10-12T22:30:00Z')
    const op = { id: 'synthetic-operation', type: 'RENEW', userId: 'owner', customerId: null,
        status: 'REVIEW_REQUIRED', renewalFlowVersion: 2, beinAccountId: 'synthetic-account', cardNumber: fullCard,
        amount: selected.price, selectedPackage: selected, promoCode: selected.appliedPromoCode || null,
        responseData: { smartcardType: 'CISCO' }, providerPayRequestedAt: submittedAt,
        providerMutationStartedAt: submittedAt, providerMutationStage: 'FINAL_OK', providerPaymentState: 'UNKNOWN',
        fulfillmentAuthority: 'NONE', fulfillmentProof: null as Record<string, unknown> | null, providerInvoiceClaim: null as Record<string, unknown> | null,
        refundSettlements: [], transactions: [], chargedBeinSpendLedger: null,
        cardLifecycleReservation: { releasedAt: null as Date | null },
        providerAccountCausalReservation: { releasedAt: null as Date | null, reservationGeneration: 1 },
        fulfillmentVerification: { id: 'verification', attemptCount: 1, attempts: [{ id: 'attempt', outcome: 'MATCHED' }] } }
    const effects = { claims: 0, proofs: 0, completionEffects: 0, releases: 0 }
    const tx = {
        $queryRaw: async (parts: TemplateStringsArray) => parts.join('').includes('FROM "card_lifecycle_reservations"') &&
            op.cardLifecycleReservation.releasedAt ? [] : [{ operationId: op.id }],
        operation: { findMany: async () => [], findUnique: async () => op, update: async ({ data }: { data: Partial<typeof op> }) => Object.assign(op, data) },
        providerInvoiceClaim: { create: async ({ data }: { data: Record<string, unknown> }) => {
            effects.claims++; op.providerInvoiceClaim = { id: 'claim', ...data }; return op.providerInvoiceClaim } },
        operationFulfillmentProof: { create: async ({ data }: { data: Record<string, unknown> }) => { effects.proofs++; op.fulfillmentProof = data } },
        operationFulfillmentVerification: { update: async () => {} }, operationIntegrityIssue: { updateMany: async () => ({ count: 0 }) },
        cardLifecycleReservation: { updateMany: async ({ data }: { data: { releasedAt: Date } }) => {
            effects.releases++; op.cardLifecycleReservation.releasedAt = data.releasedAt; return { count: 1 } } },
        providerAccountCausalReservation: { updateMany: async ({ data }: { data: { releasedAt: Date } }) => {
            effects.releases++; op.providerAccountCausalReservation.releasedAt = data.releasedAt; return { count: 1 } } },
    }
    // Serialize transactions as the production operation row lock does.
    let pending = Promise.resolve()
    const db = { $transaction: <T>(run: (value: typeof tx) => Promise<T>) => {
        const result = pending.then(() => run(tx)); pending = result.then(() => {}, () => {}); return result
    } }
    const api = loadIsolatedModule<typeof fulfillment>(fulfillmentPath, {
        '@prisma/client': { Prisma }, './prisma': { prisma: db }, './fulfillment-baseline': {},
        './fulfillment-finalization': { captureRenewalCompletionInTransaction: async () => { effects.completionEffects++ } },
        '../../../shared/operations/provider-price': price, './report-package-identity': identity,
    })
    const input = { operationId: op.id, beinAccountId: op.beinAccountId, reservationGeneration: 1,
        providerPaymentState: 'UNKNOWN' as const, reportDate: '2026-10-13', submittedAt,
        observedAt: new Date('2026-10-14T08:00:00Z'), dealerContextHash: 'a'.repeat(64), row, attemptId: 'attempt', attemptNo: 1 }
    return { api, input, op, effects, tx }
}

async function confirmWalletOnce(selected: quote.QuotePackage, packages: quote.QuotePackage[], responseData: unknown) {
    const op = { id: 'synthetic-operation', userId: 'owner', cardNumber: fullCard, status: 'AWAITING_FINAL_CONFIRM',
        amount: 0, selectedPackage: selected, availablePackages: packages, responseData, finalConfirmExpiry: null }
    let balance = 1000, deductions = 0, dispatches = 0
    const tx = { operation: { findUnique: async () => structuredClone(op),
        updateMany: async ({ data }: { data: Partial<typeof op> }) => {
            assert.equal(op.status, 'AWAITING_FINAL_CONFIRM'); Object.assign(op, data); return { count: 1 }
        } }, user: { findUnique: async () => ({ balance }),
        update: async ({ data }: { data: { balance: { decrement: number } } }) => {
            balance -= data.balance.decrement; return { balance }
        } }, transaction: { create: async () => { deductions++ } },
        operationDispatch: { findUnique: async () => null, create: async () => { dispatches++ } } }
    let pending = Promise.resolve()
    const db = { operation: tx.operation, $transaction: <T>(run: (value: typeof tx) => Promise<T>) => {
        const result = pending.then(() => run(tx)); pending = result.then(() => {}, () => {}); return result
    } }
    const api = loadPanelConfirmation(db, 'owner')
    const confirm = () => api.POST(new Request('http://localhost/synthetic', { method: 'POST',
        body: JSON.stringify({ quoteRevision: selected.quoteRevision }) }), { params: Promise.resolve({ id: op.id }) })
    const responses = await Promise.all([confirm(), confirm()])
    assert.equal(responses.filter(response => response.status === 200).length, 1)
    assert.equal(deductions, 1)
    assert.equal(dispatches, 1)
    assert.equal(balance, 1000 - selected.price)
    assert.equal(op.amount, selected.price)
}

for (const promo of ['', 'CHANGING-OFFER']) for (const lostPayReply of [false, true]) test(`mocked renewal from Check to receipt ${promo ? 'with a dynamic promo' : 'without promo'} across workers, ${lostPayReply ? 'lost Pay reply' : 'explicit provider success'}`, async () => {
    const initialName = 'Together 3 Months (3 Months)'
    const name = promo ? 'Together 3 Months + seasonal offer (3 Months)' : initialName
    const reportName = promo ? 'Together 3 Months + seasonal offer' : 'Together 3 Months'
    const amount = promo ? '24.30' : '27.00'
    const promoHtml = observedSmartcardForm('packages').replace(initialName, name).replace('27&nbsp;USD', `${amount}&nbsp;USD`)
        .replace('txtPromoCode" value=""', `txtPromoCode" value="${promo}"`)
    const first = worker([hidden, hidden + `<input name="${field}tbSerial" value="${fullCard}"><p>STB(s): ${stb}</p>`,
        ...['initial', 'selected', 'confirm', 'packages'].map(stage => observedSmartcardForm(stage as Parameters<typeof observedSmartcardForm>[0])),
        ...(promo ? [promoHtml] : [])])
    const checked = await first.client.checkCard(fullCard)
    assert.equal(checked.stbNumber, stb)
    let loaded = await first.client.loadPackages(fullCard, 'CISCO')
    assert.equal(loaded.success, true)
    if (promo) loaded = await first.client.applyPromoCode(promo, fullCard, 'CISCO')
    assert.equal(loaded.success, true)
    const revision = promo ? 1 : 0
    first.client.setRenewalQuoteRevision(revision)
    const op = { availablePackages: loaded.packages, responseData: quote.readyPackageQuote({}, loaded.packages, revision, promo || null) }
    const selected = quote.selectQuotedPackage(op, { quoteRevision: revision, packageKey: `${revision}.1` }).selectedPackage
    const storedOperation = JSON.parse(JSON.stringify({ selectedPackage: selected, stbNumber: checked.stbNumber }))
    assert.equal(selected.name, name)
    assert.equal(selected.priceText, `${amount.replace('.00', '')}\u00a0USD`)
    assert.equal(selected.priceDecimal, promo ? '24.3' : '27')
    const page = salePage(name, amount, promo)
    const reportPage = reportHtml(reportName, amount)
    const second = worker([page, page, page, page + '<p>Your Current Credit Balance is 1,000 USD</p>',
        lostPayReply ? new Error('SYNTHETIC_LOST_PAY_REPLY') : `<p>Contract Created Successfully</p><p>Your Current Credit Balance is ${promo ? '975.70' : '973.00'} USD</p>`,
        reportPage, reportPage, reportPage, reportPage])
    await second.client.importSession(JSON.parse(JSON.stringify(await first.client.exportSession())))
    assert.equal(second.client.renewalSelection.packages[0].priceDecimal, selected.priceDecimal)
    assert.equal(second.client.renewalSelection.packages[0].priceText, selected.priceText)
    second.client.setSTBNumber(storedOperation.stbNumber)
    second.client.assertRenewalSelection(selected, { cardNumber: fullCard, smartcardType: 'CISCO' })
    const prepared = await second.client.completePurchase(selected, undefined, stb, true)
    assert.equal(prepared.awaitingConfirm, true, prepared.message)
    assert.equal(prepared.packageEvidence.priceDecimal, selected.priceDecimal)
    assert.equal(second.requests.length, 3)
    assert.equal(second.requests[0].body.get(selected.checkboxValue!), 'on')
    assert.equal(second.requests[2].body.get(field + 'tbStbSerial1'), stb)
    assert.equal(second.requests[2].body.get(field + 'tbStbSerial2'), stb)
    await confirmWalletOnce(selected, loaded.packages, op.responseData)
    let mutationMarkers = 0, payMarkers = 0
    const confirm = () => second.client.confirmPurchase(selected.price, async () => { mutationMarkers++ }, async () => {},
        { selectedPackage: selected, cardNumber: fullCard }, async () => { payMarkers++ }, true)
    const confirmed = await confirm()
    assert.equal(confirmed.finalPaySubmitted, true)
    assert.equal(confirmed.success, !lostPayReply)
    assert.equal((await confirm()).success, false)
    assert.equal(mutationMarkers, 1)
    assert.equal(payMarkers, 1)
    const report = await second.client.scanSoldPackagesReport({ dateRange: { from: '2026-10-13', to: '2026-10-13' }, scanAttempts: 1 })
    assert.equal(report.outcome, 'COMPLETE', report.reasonCode)
    const db = database(selected, report.rows[0])
    const match = db.api.correlateSameDayReport({ report, cardNumber: fullCard, smartcardType: 'CISCO', selectedPackage: selected,
        claimedInvoices: new Map(), operationId: db.op.id })
    assert.equal(match.outcome, 'MATCHED')
    assert.notEqual(report.rows[0].packageName, selected.name)
    const completed = await Promise.all([db.api.finalizeSameDayReport(db.input), db.api.finalizeSameDayReport(db.input)])
    assert.deepEqual(Array.from(completed).sort(), ['ALREADY_COMPLETED', 'COMPLETED'])
    const receipt = projectRenewalReceipt(db.op as unknown as Parameters<typeof projectRenewalReceipt>[0])
    assert.equal(receipt?.packageName, `Add ${reportName}`)
    assert.equal(receipt?.providerAmount, amount)
    assert.equal(receipt?.beinInvoiceNo, '1001')
    assert.deepEqual(db.effects, { claims: 1, proofs: 1, completionEffects: 1, releases: 2 })
    assert.equal(second.requests.filter(request => request.url.endsWith('/renew')).length, 5)
    assert.equal(second.requests.filter(request => request.body.has(field + 'BtnPay')).length, 1)
    assert.equal(first.requests.filter(request => request.body.has(field + 'btnCheck')).length, 1)
    assert.equal(second.requests.some(request => request.url.endsWith('/check') || request.body.has(field + 'btnPromoCode') || request.body.has(field + 'btnLoad1')), false)
    const criteria = second.requests.filter(request => request.url.endsWith('/report') && request.method === 'POST')
    assert.ok(criteria.length)
    assert.ok(criteria.every(request => request.body.get(field + 'DateFrom$txtDate') === '13/10/2026' && request.body.get(field + 'DateTo$txtDate') === '13/10/2026'))
})

for (const [label, patch] of [
    ['different duration', { packageName: 'Add Premium 24 Months' }],
    ['different offer', { packageName: 'Add Premium 6 Months + 25% OFF' }],
    ['sub-cent amount difference', { providerAmount: '108.004' }],
    ['different currency', { currency: 'EUR' }],
] as const) test(`transaction rejects ${label} even after an earlier MATCHED attempt`, async () => {
    const selected = { index: 1, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD' }
    const row = reports.parseSoldPackagesReportPage(observedReport()).rows[0]
    const db = database(selected, { ...row, ...patch })
    assert.equal(await db.api.finalizeSameDayReport(db.input), 'PROOF_CONFLICT')
    assert.deepEqual(db.effects, { claims: 0, proofs: 0, completionEffects: 0, releases: 0 })
})

test('unchanged proof schema cannot silently round an exactly matched fractional provider amount', async () => {
    const selected = { index: 1, name: 'Premium 6 Months (6 Months)', price: 108.004, priceDecimal: '108.004', currency: 'USD' }
    const row = reports.parseSoldPackagesReportPage(observedReport()).rows[0]
    const db = database(selected, { ...row, providerAmount: '108.004' })
    assert.equal(await db.api.finalizeSameDayReport(db.input), 'PROOF_CONFLICT')
    assert.equal(db.effects.proofs, 0)
})

for (const scenario of ['different payment day', 'explicit provider rejection']) test(`transaction refuses ${scenario}`, async () => {
    const selected = { index: 1, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD' }
    const row = reports.parseSoldPackagesReportPage(observedReport()).rows[0]
    const db = database(selected, row)
    const input = { ...db.input, ...(scenario === 'different payment day'
        ? { reportDate: '2026-10-12' } : { providerPaymentState: 'NOT_CHARGED' as const }) }
    assert.equal(await db.api.finalizeSameDayReport(input), 'PROOF_CONFLICT')
    assert.equal(db.effects.proofs, 0)
})

test('actual report worker logs bounded match diagnostics and never private provider data', async () => {
    const path = 'worker/src/http-queue-processor.ts'
    const logs: string[] = []
    const report = reports.parseSoldPackagesReportPage(reportHtml('Premium 6 Months', '108.004'))
    const current = { id: 'synthetic-operation', status: 'COMPLETING', renewalFlowVersion: 2,
        beinAccountId: 'synthetic-account', cardNumber: fullCard,
        selectedPackage: { index: 1, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD' },
        responseData: { quoteRevision: 4 }, providerPayRequestedAt: new Date('2026-10-13T06:00:00Z') }
    const deps = { ...dependencies(path), '@prisma/client': { Prisma, OperationStatus },
        '../../shared/operations/package-quote': quote,
        './lib/fulfillment-baseline': { getRenewalFulfillmentConfig: async () => ({ reportPageCap: 100, reportScanAttempts: 1 }) },
        './lib/same-day-report-fulfillment': { ...database(current.selectedPackage, report.rows[0]).api,
            recordSameDayAttempt: async () => ({ attemptId: 'attempt', attemptNo: 1, retryDueAt: null }) },
        './lib/prisma': { prisma: { operation: { findUnique: async () => current, updateMany: async () => ({ count: 1 }) },
            providerInvoiceClaim: { findMany: async () => [] } } } }
    const api = loadIsolatedModule<{ verifySameDayRenewal: (input: unknown) => Promise<void> }>(path, deps,
        ['verifySameDayRenewal'], {}, { console: { log: (...parts: unknown[]) => logs.push(parts.join(' ')) } })
    await api.verifySameDayRenewal({ operationId: current.id, client: { scanSoldPackagesReport: async () => report },
        accountPool: {}, reservationGeneration: 1, providerPaymentState: 'UNKNOWN',
        responseData: { smartcardType: 'CISCO', promoCode: 'PRIVATE_PROMO', stbNumber: stb, cookies: 'PRIVATE_COOKIE' },
        assertCurrent: async () => {}, renewReadSession: async () => false })
    const diagnostic = logs.find(line => line.startsWith('[HTTP] Same-day report match:'))!
    assert.match(diagnostic, /synthetic-operation/)
    assert.match(diagnostic, /"quoteRevision":4/)
    assert.match(diagnostic, /REPORT_ACTION_PREFIX/)
    assert.match(diagnostic, /"nameMatches":1/)
    assert.match(diagnostic, /"amountMatches":0/)
    assert.doesNotMatch(diagnostic, new RegExp(`${fullCard}|${stb}|PRIVATE_PROMO|PRIVATE_COOKIE|private-state|<table|Premium`))
})


test('released review records matching Reports evidence without financial writes or reopening ownership', async () => {
    const path = 'worker/src/http-queue-processor.ts'
    const report = { ...reports.parseSoldPackagesReportPage(reportHtml('Premium 6 Months', '108')), outcome: 'COMPLETE', dealerContextHash: 'a'.repeat(64) }
    const current = { id: 'old-review', status: 'REVIEW_REQUIRED', renewalFlowVersion: 2,
        beinAccountId: 'account', cardNumber: fullCard, createdAt: new Date('2026-10-13T04:00:00Z'),
        selectedPackage: { index: 1, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD' },
        responseData: { quoteRevision: 1 }, providerPayRequestedAt: new Date('2026-10-13T06:00:00Z') }
    let observations = 0
    const unexpected = () => { throw new Error('UNEXPECTED_FINANCIAL_OR_RESERVATION_WRITE') }
    const deps = { ...dependencies(path), '@prisma/client': { Prisma, OperationStatus },
        '../../shared/operations/package-quote': quote,
        './lib/fulfillment-baseline': { getRenewalFulfillmentConfig: async () => ({ reportPageCap: 100, reportScanAttempts: 1 }) },
        './lib/same-day-report-fulfillment': { ...database(current.selectedPackage, report.rows[0]).api,
            finalizeSameDayReport: unexpected, recordSameDayAttempt: async (input: { outcome: string }) => {
                assert.equal(input.outcome, 'MATCHED'); observations++; return { attemptId: 'observed', attemptNo: 2 }
            } },
        './lib/prisma': { prisma: { $transaction: unexpected,
            operation: { findUnique: async () => current, findMany: async () => [], updateMany: unexpected },
            providerInvoiceClaim: { findMany: async () => [] } } } }
    const api = loadIsolatedModule<{ verifySameDayRenewal: (input: unknown) => Promise<void> }>(path, deps, ['verifySameDayRenewal'])
    await api.verifySameDayRenewal({ evidenceOnly: true, operationId: current.id,
        client: { scanSoldPackagesReport: async () => report }, accountPool: {}, reservationGeneration: 1,
        providerPaymentState: 'UNKNOWN', responseData: { smartcardType: 'CISCO' },
        assertCurrent: async () => {}, renewReadSession: async () => false })
    assert.equal(observations, 1)
    assert.equal(current.status, 'REVIEW_REQUIRED')
})

test('transaction rejects a matching report after ownership ended without creating a receipt', async () => {
    const selected = { index: 1, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD' }
    const row = reports.parseSoldPackagesReportPage(observedReport()).rows[0]
    const db = database(selected, row)
    db.op.cardLifecycleReservation.releasedAt = new Date()
    db.op.providerAccountCausalReservation.releasedAt = new Date()
    assert.equal(await db.api.finalizeSameDayReport(db.input), 'PROOF_CONFLICT')
    assert.deepEqual(db.effects, { claims: 0, proofs: 0, completionEffects: 0, releases: 0 })
})


test('a released review gets only a read lease and cannot take another operation account reservation', async () => {
    const path = 'worker/src/http-queue-processor.ts'
    let busy = false, claims = 0
    const tx = { $queryRaw: async () => [], operation: { findUnique: async () => ({
        status: 'REVIEW_REQUIRED', administrativeStopRequestedAt: null,
        providerAccountCausalReservation: { releasedAt: new Date(), reservationGeneration: 2 },
    }) } }
    const lease = { reservationGeneration: 2 }
    const deps = { ...dependencies(path), '@prisma/client': { Prisma, OperationStatus },
        'node:crypto': { randomUUID: () => 'lease' },
        './lib/prisma': { prisma: { beinAccount: { findUnique: async () => ({ isActive: true, automationExclusive: true }) },
            $transaction: async (run: (value: typeof tx) => unknown) => run(tx) } },
        './lib/crypto': { decryptAccountPassword: (account: unknown) => account },
        './lib/provider-account-reservation': { findActiveProviderAccountReservationForAccount: async () => busy ? { operationId: 'new' } : null,
            acquireProviderAccountCausalReservation: () => { throw new Error('REVIEW_MUST_NOT_REOPEN') } },
        './pool/account-locking': { acquireAccountExecutionLease: async () => { claims++; return lease } },
    }
    const api = loadIsolatedModule<{ reserveProviderAccountForFulfillment: (input: unknown) => Promise<{ evidenceOnly: boolean } | null> }>(path, deps, ['reserveProviderAccountForFulfillment'])
    const input = { operationId: 'old-review', beinAccountId: 'account', consumer: 'REPORT',
        accountPool: { getRedis: () => ({}), getWorkerId: () => 'worker' } }
    assert.equal((await api.reserveProviderAccountForFulfillment(input))?.evidenceOnly, true)
    busy = true
    assert.equal(await api.reserveProviderAccountForFulfillment(input), null)
    assert.equal(claims, 1)
})
