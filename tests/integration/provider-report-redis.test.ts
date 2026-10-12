import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import Redis from 'ioredis'
import { Queue, Worker } from 'bullmq'
import { admitReportRequest, readReportRequest, claimReportRequest, finishReportRequest, reportRequestKey } from '../../shared/reports/bein-provider-store'
import { reportPage } from '../../shared/reports/bein-provider'
import { handleProviderReportJob, type ReportReaderRuntime } from '../../worker/src/lib/provider-report-reader'
import { lockAccount, unlockAccount, extendLock, getAccountLockStatus } from '../../worker/src/pool/account-locking'
import { HttpClientService } from '../../worker/src/http/HttpClientService'
import { observedReport } from '../../worker/tests/fixtures/renewal-observed'

const url = process.env.PROVIDER_REPORT_TEST_REDIS_URL
if (url && (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname) || new URL(url).pathname !== '/15'))
    throw new Error('Report tests require an explicitly supplied loopback Redis database 15')
const native = { skip: !url }
function connection() { return new Redis(url!, { maxRetriesPerRequest: null }) }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function clean(redis: Redis, accountId: string, ids: string[]) {
    await redis.del(...ids.map(reportRequestKey), `bein:report-browser:active:${accountId}`, `bein:report-browser:pace:${accountId}`, `bein:account:lock:${accountId}`)
    await redis.quit()
}
test('native Redis: concurrent admission, refresh pace, execution claim and terminal fencing', native, async () => {
    const redis = connection(), accountId = `qa-${randomUUID()}`, ids = Array.from({ length: 20 }, () => randomUUID())
    try {
        const inputs = { accountId, from: '2026-10-06', to: '2026-10-12' }
        const admitted = await Promise.all(ids.map(id => admitReportRequest(redis, inputs, id)))
        assert.equal(admitted.filter(r => r.kind === 'CREATED').length, 1)
        assert.equal(admitted.filter(r => r.kind === 'EXISTING').length, 19)
        const made = admitted.find(r => r.kind === 'CREATED')!
        if (!('request' in made)) throw new Error('No request')
        assert.equal((await admitReportRequest(redis, { ...inputs, from: '2026-10-01' }, randomUUID())).kind, 'ACCOUNT_BUSY')
        const tokens = [randomUUID(), randomUUID()]
        const claims = await Promise.all(tokens.map(token => claimReportRequest(redis, made.request, token)))
        assert.equal(claims.filter(Boolean).length, 1)
        const token = tokens[claims.indexOf(true)]
        assert.equal(await finishReportRequest(redis, { ...made.request, state: 'COMPLETED', rows: [] }, 'stale'), false)
        assert.equal(await finishReportRequest(redis, { ...made.request, state: 'COMPLETED', rows: [] }, token), true)
        assert.equal(await finishReportRequest(redis, { ...made.request, state: 'FAILED', errorCode: 'REPORT_FAILED' }, token), false)
        assert.equal((await admitReportRequest(redis, inputs, randomUUID())).kind, 'RATE_LIMITED')
        assert.ok(await redis.ttl(reportRequestKey(made.request.id)) >= 298)
        assert.equal((await readReportRequest(redis, made.request.id))?.state, 'COMPLETED')
    } finally { await clean(redis, accountId, ids) }
})
test('native BullMQ + Redis + simulated HTTP: full report read and duplicate job without duplicate provider access', native, async () => {
    const redis = connection(), accountId = `qa-${randomUUID()}`, id = randomUUID(), queueName = `provider-report-qa-${randomUUID()}`
    const requests: { method: string; path: string; body: string }[] = []
    const server = createServer(async (req, res) => {
        let body = ''; for await (const chunk of req) body += chunk
        requests.push({ method: req.method!, path: req.url!, body })
        if (req.url !== '/report') { res.writeHead(500); res.end('UNEXPECTED_ENDPOINT'); return }
        const fields = new URLSearchParams(body)
        const html = observedReport().replace('txtDate" value=""', `txtDate" value="${fields.get('ctl00$ContentPlaceHolder1$DateFrom$txtDate') || ''}"`)
            .replace('txtDate" value=""', `txtDate" value="${fields.get('ctl00$ContentPlaceHolder1$DateTo$txtDate') || ''}"`)
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port')
    const origin = `http://127.0.0.1:${address.port}`
    const workerId = `qa-worker-${randomUUID()}`
    const runtime: ReportReaderRuntime = {
        account: async requested => { assert.equal(requested, accountId); return { id: accountId, username: 'synthetic', isActive: true, automationExclusive: true } as Awaited<ReturnType<ReportReaderRuntime['account']>> },
        reserved: async () => false,
        acquire: (a, owner) => lockAccount(redis, a, workerId, 120, owner), renew: (a, owner) => extendLock(redis, a, workerId, 120, owner),
        release: (a, owner) => unlockAccount(redis, a, workerId, owner),
        assertOwner: async (a, owner) => { const lock = await getAccountLockStatus(redis, a); assert.equal(lock.ownerOperationId, owner) },
        client: async () => {
            const client = new HttpClientService(undefined, accountId)
            ;(client as unknown as { config: unknown }).config = { loginUrl: `${origin}/login`, soldPackagesReportUrl: `${origin}/report` }
            client.markSessionValidFromCache(Date.now() + 60_000)
            return client
        },
    }
    const queue = new Queue(queueName, { connection: { url: url! } })
    const worker = new Worker(queueName, job => handleProviderReportJob(job.data.requestId, redis, runtime), { connection: { url: url! }, concurrency: 4 })
    try {
        await admitReportRequest(redis, { accountId, from: '2026-10-06', to: '2026-10-12' }, id)
        await queue.add('read-provider-report', { requestId: id }, { attempts: 1 })
        const until = Date.now() + 10_000
        let stored = await readReportRequest(redis, id)
        while (stored?.state !== 'COMPLETED' && Date.now() < until) { await sleep(50); stored = await readReportRequest(redis, id) }
        assert.equal(stored?.state, 'COMPLETED'); assert.equal(stored?.rows?.[0].providerAmount, '108')
        assert.equal(requests.length, 4); assert.ok(requests.every(r => r.path === '/report'))
        for (const r of requests.filter(r => r.method === 'POST')) {
            const body = new URLSearchParams(r.body)
            assert.equal(body.get('ctl00$ContentPlaceHolder1$DateFrom$txtDate'), '06/10/2026')
            assert.equal(body.get('ctl00$ContentPlaceHolder1$btnApply'), 'Apply')
            assert.equal(body.has('BtnPay'), false)
        }
        await queue.add('replayed-read', { requestId: id }, { attempts: 1 }); await sleep(150)
        assert.equal(requests.length, 4)
        assert.equal((await getAccountLockStatus(redis, accountId)).locked, false)
    } finally {
        await worker.close(); await queue.obliterate({ force: true }); await queue.close()
        server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
        await clean(redis, accountId, [id])
    }
})
test('native expired queued request and interrupted running request never start a replacement read', native, async () => {
    const redis = connection(), accountId = `qa-${randomUUID()}`, id = randomUUID()
    const forbidden = new Proxy({}, { get: () => { throw new Error('UNEXPECTED_PROVIDER_ACCESS') } }) as ReportReaderRuntime
    try {
        const admitted = await admitReportRequest(redis, { accountId, from: '2026-10-06', to: '2026-10-12' }, id, Date.now() - 300_001)
        assert.equal(admitted.kind, 'CREATED')
        await handleProviderReportJob(id, redis, forbidden)
        const result = await readReportRequest(redis, id)
        assert.equal(result?.errorCode, 'REPORT_TIMEOUT')
        await redis.del(`bein:report-browser:pace:${accountId}`)
        const next = await admitReportRequest(redis, { accountId, from: '2026-10-06', to: '2026-10-12' }, id)
        if (!('request' in next) || !next.request) throw new Error('No request')
        await claimReportRequest(redis, next.request, 'interrupted-owner')
        await handleProviderReportJob(id, redis, forbidden)
        const held = await readReportRequest(redis, id)
        assert.equal(held?.state, 'RUNNING')
        assert.equal(reportPage(held!, 1, '', held!.deadline).errorCode, 'REPORT_TIMEOUT')
    } finally { await clean(redis, accountId, [id]) }
})
