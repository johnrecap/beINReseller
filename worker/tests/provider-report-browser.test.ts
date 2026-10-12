import test from 'node:test'
import assert from 'node:assert/strict'
import { scanSoldPackagesReport } from '../src/http/sold-packages-report'
import { observedReport } from './fixtures/renewal-observed'
import { readProviderReport, ReportReadError, type ReportReaderRuntime } from '../src/lib/provider-report-reader'
import { defaultReportDates, validReportCriteria, reportPage, type ProviderReportRequest } from '../../shared/reports/bein-provider'
import { HttpClientService } from '../src/http/HttpClientService'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

const request: ProviderReportRequest = { id: 'request-a', accountId: 'account-a', from: '2026-10-06', to: '2026-10-12',
    state: 'QUEUED', createdAt: Date.now(), deadline: Date.now() + 300_000 }
function transport() {
    const bodies: Record<string, string>[] = []
    return { bodies, freshGet: async () => observedReport(), post: async (controls: readonly { name: string; value: string }[]) => {
        const body = Object.fromEntries(controls.map(c => [c.name, c.value])); bodies.push(body)
        return observedReport().replace('txtDate" value=""', `txtDate" value="${body['ctl00$ContentPlaceHolder1$DateFrom$txtDate']}"`)
            .replace('txtDate" value=""', `txtDate" value="${body['ctl00$ContentPlaceHolder1$DateTo$txtDate']}"`)
    } }
}
function runtime(changes: Partial<ReportReaderRuntime> = {}) {
    const calls: string[] = []
    let expired = false
    const http = transport()
    const client = {
        restrictToReportReads: () => { calls.push('restrict') }, isSessionActive: () => true,
        invalidateSession: () => { calls.push('invalidate') }, login: async () => { calls.push('login'); return { success: true } },
        scanSoldPackagesReport: async (options: Parameters<typeof scanSoldPackagesReport>[1]) => {
            calls.push('scan'); if (expired) { expired = false; return { outcome: 'CHECK_FAILED' as const, reasonCode: 'LOGIN_REQUIRED', rows: [], dealerContextHash: null, pageCount: 0, pageCap: 100, scanAttemptCount: 1, firstPageWatermark: null } }
            return scanSoldPackagesReport(http, options)
        },
    }
    const services: ReportReaderRuntime = {
        account: async id => { calls.push(`account:${id}`); return { id, username: 'synthetic', password: 'synthetic', isActive: true, automationExclusive: true } as Awaited<ReturnType<ReportReaderRuntime['account']>> },
        reserved: async () => false, acquire: async () => { calls.push('lock'); return true },
        assertOwner: async () => {}, renew: async () => true, release: async () => { calls.push('release') },
        client: async () => client, ...changes,
    }
    return { services, calls, client, expire: () => { expired = true } }
}
test('representative browser read uses exact account, date criteria, All, complete HTTP scan and safe rows', async () => {
    const http = transport()
    const scan = await scanSoldPackagesReport(http, { dateRange: request })
    assert.equal(scan.outcome, 'COMPLETE')
    assert.equal(http.bodies.length, 2)
    for (const body of http.bodies) {
        assert.equal(body['ctl00$ContentPlaceHolder1$DateFrom$txtDate'], '06/10/2026')
        assert.equal(body['ctl00$ContentPlaceHolder1$DateTo$txtDate'], '12/10/2026')
        assert.equal(body['ctl00$ContentPlaceHolder1$ddlType'], '0')
        assert.equal(body['ctl00$ContentPlaceHolder1$cboDealer'], 'dealer-a')
    }
    const r = runtime()
    const rows = await readProviderReport(request, r.services, new AbortController().signal)
    assert.equal(rows[0].invoiceNo, '1001')
    assert.equal('rowFingerprint' in rows[0], false)
    assert.deepEqual(r.calls, ['account:account-a', 'lock', 'restrict', 'scan', 'release'])
})
test('dates include today and six earlier Cairo calendar days, with 31-day inclusive cap', () => {
    assert.deepEqual(defaultReportDates(new Date('2026-10-11T22:30:00Z')), { from: '2026-10-06', to: '2026-10-12' })
    assert.equal(validReportCriteria({ ...request, from: '2026-02-30' }), false)
    assert.equal(validReportCriteria({ ...request, from: '2026-10-12', to: '2026-10-01' }), false)
    assert.equal(validReportCriteria({ ...request, from: '2026-10-01', to: '2026-10-31' }), true)
    assert.equal(validReportCriteria({ ...request, from: '2026-10-01', to: '2026-11-01' }), false)
})
test('provider refusal to echo requested dates is incomplete, never empty success', async () => {
    const scan = await scanSoldPackagesReport({ freshGet: async () => observedReport(), post: async () => observedReport() }, { dateRange: request })
    assert.equal(scan.outcome, 'INCOMPLETE_SCAN')
    assert.equal(scan.reasonCode, 'DEALER_CONTEXT_CHANGED')
})
for (const conflict of ['reserved', 'locked', 'lost', 'disabled']) test(`report rejects ${conflict} account without substitute`, async () => {
    const r = runtime(conflict === 'reserved' ? { reserved: async () => true } : conflict === 'locked' ? { acquire: async () => false } :
        conflict === 'lost' ? { assertOwner: async () => { throw new ReportReadError('ACCOUNT_BUSY') } } : { account: async () => null })
    await assert.rejects(readProviderReport(request, r.services, new AbortController().signal), /ACCOUNT_/)
    assert.equal(r.calls.includes('scan'), false)
    if (conflict === 'lost') assert.equal(r.calls.at(-1), 'release')
})
test('cached session expiry permits one fresh login then a new report scan', async () => {
    const r = runtime(); r.expire()
    await readProviderReport(request, r.services, new AbortController().signal)
    assert.equal(r.calls.filter(c => c === 'login').length, 1)
    assert.equal(r.calls.filter(c => c === 'scan').length, 2)
})
test('CAPTCHA becomes a safe failure and releases account without scanning', async () => {
    const r = runtime(); r.client.isSessionActive = () => false
    r.client.login = async () => ({ success: false, requiresCaptcha: true })
    await assert.rejects(readProviderReport(request, r.services, new AbortController().signal), /CAPTCHA_REQUIRED/)
    assert.equal(r.calls.includes('scan'), false); assert.equal(r.calls.at(-1), 'release')
})
test('aborted requests do not start HTTP and release acquired ownership', async () => {
    const r = runtime(); const c = new AbortController(); c.abort(new ReportReadError('REPORT_TIMEOUT'))
    await assert.rejects(readProviderReport(request, r.services, c.signal), /REPORT_TIMEOUT/)
    assert.equal(r.calls.includes('scan'), false); assert.equal(r.calls.at(-1), 'release')
})
test('display paging sorts invoices numerically, searches serials, hides worker tokens and times out pending work', () => {
    const rows = ['9', '100', '20'].map(invoiceNo => ({ invoiceNo, cardNumber: '70001', itemType: 'Card_CISCO', packageName: 'Premium + 20% OFF', contractStartDate: '12/10/2026', contractExpiryDate: '11/04/2027', providerAmount: '86.4', currency: 'USD' as const }))
    const page = reportPage({ ...request, state: 'COMPLETED', rows, runToken: 'secret' })
    assert.deepEqual(page.rows.map(r => r.invoiceNo), ['100', '20', '9']); assert.equal('runToken' in page, false)
    assert.equal(reportPage({ ...request, state: 'COMPLETED', rows }, 1, 'nothing').total, 0)
    assert.equal(reportPage(request, 1, '', request.deadline).errorCode, 'REPORT_TIMEOUT')
})

test('report HTTP scope rejects provider mutations, foreign hosts and redirects before transport', async () => {
    const client = new HttpClientService(undefined, 'account-a')
    const internals = client as unknown as { config: { loginUrl: string; soldPackagesReportUrl: string }; axios: AxiosInstance }
    internals.config = { loginUrl: 'https://provider.invalid/Dealers/NLogin.aspx', soldPackagesReportUrl: 'https://provider.invalid/Dealers/Reports/frmSoldPackagesReport.aspx' }
    let calls = 0; let last: InternalAxiosRequestConfig | null = null; let owned = true
    internals.axios.defaults.adapter = async config => { calls++; last = config; return { config, status: 200, statusText: 'OK', headers: {}, data: observedReport() } }
    const abort = new AbortController()
    client.restrictToReportReads(abort.signal, async () => { if (!owned) throw new ReportReadError('ACCOUNT_BUSY') })
    await internals.axios.get(internals.config.soldPackagesReportUrl)
    assert.equal(calls, 1)
    for (const url of ['https://provider.invalid/Dealers/Pages/frmSellPackages.aspx', 'https://elsewhere.invalid/'])
        await assert.rejects(internals.axios.post(url, 'BtnPay=Pay'), /REPORT_READ_ONLY_BOUNDARY/)
    assert.equal(calls, 1)
    assert.throws(() => (last as unknown as InternalAxiosRequestConfig).beforeRedirect?.({ protocol: 'https:', hostname: 'elsewhere.invalid', path: '/', method: 'GET' }, { headers: {}, statusCode: 302 }), /REPORT_READ_ONLY_REDIRECT/)
    owned = false
    await assert.rejects(internals.axios.get(internals.config.soldPackagesReportUrl), /ACCOUNT_BUSY/)
    owned = true; abort.abort(new ReportReadError('REPORT_TIMEOUT'))
    await assert.rejects(internals.axios.get(internals.config.soldPackagesReportUrl), /REPORT_TIMEOUT/)
    assert.equal(calls, 1)
})

test('report deadline aborts an in-flight HTTP adapter rather than leaving a detached read', async () => {
    const client = new HttpClientService(undefined, 'account-a')
    const internals = client as unknown as { config: { loginUrl: string; soldPackagesReportUrl: string }; axios: AxiosInstance }
    internals.config = { loginUrl: 'https://provider.invalid/login', soldPackagesReportUrl: 'https://provider.invalid/report' }
    let stopped = false
    internals.axios.defaults.adapter = config => new Promise((_resolve, reject) => {
        config.signal?.addEventListener?.('abort', () => { stopped = true; reject(new Error('ABORTED_IN_FLIGHT')) })
    })
    const abort = new AbortController(); client.restrictToReportReads(abort.signal, async () => {})
    const run = internals.axios.get(internals.config.soldPackagesReportUrl)
    const timer = setTimeout(() => abort.abort(), 20)
    await assert.rejects(run)
    clearTimeout(timer); assert.equal(stopped, true)
})
