import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as contract from '../../shared/reports/bein-provider'

type Handler = (req: Request & { nextUrl: URL }, args?: { params: Promise<{ requestId: string }> }) => Promise<Response>
const input = { accountId: 'account-a', from: '2026-10-06', to: '2026-10-12' }
function harness(role: string | null = 'ADMIN') {
    const calls: string[] = []
    const id = randomUUID()
    const request: contract.ProviderReportRequest = { ...input, id, state: 'QUEUED', createdAt: Date.now(), deadline: Date.now() + 300_000 }
    const json = (data: unknown, init?: ResponseInit) => Response.json(data, init)
    const api = {
        errorResponse: (error: string, status: number, code: string) => json({ error, code }, { status }),
        successResponse: (data: unknown, _message?: string, status?: number) => json({ success: true, data }, { status }),
    }
    const store = {
        admitReportRequest: async () => { calls.push('admit'); return { kind: 'CREATED', request } },
        finishReportRequest: async () => { calls.push('finish'); return true },
        readReportRequest: async () => { calls.push('read'); return request },
    }
    const queue = { add: async (_name: string, data: unknown, options: { attempts: number; priority: number }) => {
        calls.push('queue'); assert.deepEqual(JSON.parse(JSON.stringify(data)), { type: 'READ_PROVIDER_REPORT', requestId: id });
        assert.equal(options.attempts, 1); assert.equal(options.priority, 10)
    } }
    const account = { isActive: true, automationExclusive: true }
    const common = {
        'node:crypto': { randomUUID },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async (_req: unknown, required: string) => {
            assert.equal(required, 'ADMIN'); return !role ? { error: 'Unauthorized', status: 401 } : role !== 'ADMIN'
                ? { error: 'Denied', status: 403 } : { user: { id: 'admin', role } }
        } },
        '@/lib/prisma': { prisma: { beinAccount: { findUnique: async (query: { where: { id: string } }) => { calls.push('account'); assert.equal(query.where.id, input.accountId); return account } } } },
        '@/lib/redis': { default: {} }, '@/lib/queue': { operationsQueue: queue }, '@/lib/api-response': api,
        'next/server': { NextResponse: { json } },
    }
    const post = loadIsolatedModule<{ POST: Handler }>('src/app/api/admin/reports/bein-provider/route.ts', {
        ...common, '../../../../../../shared/reports/bein-provider': contract,
        '../../../../../../shared/reports/bein-provider-store': store,
    }).POST
    const get = loadIsolatedModule<{ GET: Handler }>('src/app/api/admin/reports/bein-provider/[requestId]/route.ts', {
        ...common, '../../../../../../../shared/reports/bein-provider': contract,
        '../../../../../../../shared/reports/bein-provider-store': store,
    }).GET
    const req = (body: unknown = input, suffix = '') => Object.assign(new Request(`http://localhost/report${suffix}`, { method: 'POST', body: JSON.stringify(body) }), { nextUrl: new URL(`http://localhost/report${suffix}`) })
    return { post, get, req, calls, store, queue, account, request }
}
for (const role of [null, 'USER', 'MANAGER', 'AGENT']) test(`provider report endpoints deny ${role || 'anonymous'} before storage or queue`, async () => {
    const h = harness(role)
    assert.equal((await h.post(h.req())).status, role ? 403 : 401)
    assert.equal((await h.get(h.req(), { params: Promise.resolve({ requestId: h.request.id }) })).status, role ? 403 : 401)
    assert.deepEqual(h.calls, [])
})
test('admitted admin read queues only the report ID, without business operation or credentials', async () => {
    const h = harness(); const response = await h.post(h.req())
    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), { success: true, data: { requestId: h.request.id } })
    assert.deepEqual(h.calls, ['account', 'admit', 'queue'])
})
test('invalid dates and inactive account stop before dispatch', async () => {
    const h = harness()
    assert.equal((await h.post(h.req({ ...input, to: '2026-12-31' }))).status, 400)
    h.account.isActive = false
    assert.equal((await h.post(h.req())).status, 409)
    assert.deepEqual(h.calls, ['account'])
})
test('queue failure marks request failed and does not claim accepted execution', async () => {
    const h = harness(); h.queue.add = async () => { throw new Error('synthetic queue failure') }
    assert.equal((await h.post(h.req())).status, 503)
    assert.deepEqual(h.calls, ['account', 'admit', 'finish'])
})
test('polling reads only cached result, never invokes beIN or queues work, and strips worker token', async () => {
    const h = harness(); h.request.runToken = 'PRIVATE'; h.request.state = 'RUNNING'
    const response = await h.get(h.req(), { params: Promise.resolve({ requestId: h.request.id }) })
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal('runToken' in await response.json(), false); assert.deepEqual(h.calls, ['read'])
})

test('report account options require admin and select only public account metadata', async () => {
    let role: string | null = null
    let reads = 0
    const get = loadIsolatedModule<{ GET: Handler }>('src/app/api/admin/bein-accounts/route.ts', {
        'next/server': { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async (_req: unknown, required: string) => {
            assert.equal(required, 'ADMIN')
            return role === 'ADMIN' ? { user: { role } } : { error: 'Denied', status: role ? 403 : 401 }
        } },
        '@/lib/prisma': { prisma: { beinAccount: { findMany: async (query: unknown) => {
            reads++
            assert.deepEqual(JSON.parse(JSON.stringify(query)), {
                select: { id: true, username: true, label: true, isActive: true, automationExclusive: true },
                orderBy: { username: 'asc' },
            })
            return [{ id: 'a', username: 'dealer-a', label: null, isActive: true, automationExclusive: true },
                { id: 'b', username: 'dealer-b', label: 'Unavailable', isActive: false, automationExclusive: true }]
        } } } },
        '@/lib/crypto': {}, ioredis: class { constructor() { throw new Error('OPTIONS_MUST_NOT_OPEN_REDIS') } },
        '@/lib/operations/account-lock-release': {}, '@/lib/provider-account-identity': {},
    }).GET
    const req = Object.assign(new Request('http://localhost/?view=report-options'), { nextUrl: new URL('http://localhost/?view=report-options') })
    for (role of [null, 'USER', 'MANAGER', 'AGENT']) assert.equal((await get(req)).status, role ? 403 : 401)
    assert.equal(reads, 0)
    role = 'ADMIN'
    const response = await get(req)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(await response.json(), { accounts: [
        { id: 'a', username: 'dealer-a', label: null, eligible: true },
        { id: 'b', username: 'dealer-b', label: 'Unavailable', eligible: false },
    ] })
    assert.equal(reads, 1)
})
