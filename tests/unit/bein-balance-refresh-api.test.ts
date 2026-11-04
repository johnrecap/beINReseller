import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as contract from '../../shared/bein/balance-refresh'

type Handler = (request: Request & { nextUrl: URL }, context: { params: Promise<{ id: string }> }) => Promise<Response>
function fixture(role: string | null = 'ADMIN') {
    const calls: string[] = []
    const request: contract.BalanceRefreshRequest = { requestId: 'synthetic-request', accountId: 'account-a',
        state: 'QUEUED', createdAt: Date.now(), deadline: Date.now() + 300_000, expiresAt: Date.now() + 660_000 }
    const settings = { active: true, exclusive: true, created: true, queueFails: false, storeFails: false, missing: false }
    const store = {
        admitBalanceRefresh: async () => { calls.push('admit'); if (settings.storeFails) throw new Error('private'); return { created: settings.created, request } },
        readBalanceRefresh: async () => { calls.push('read'); if (settings.storeFails) throw new Error('private'); return settings.missing ? null : request },
        activeBalanceRefresh: async () => { calls.push('active'); if (settings.storeFails) throw new Error('private'); return settings.missing ? null : request },
    }
    const api = loadIsolatedModule<{ POST: Handler; GET: Handler }>('src/app/api/admin/bein-accounts/[id]/check-balance/route.ts', {
        'node:crypto': { randomUUID: () => request.requestId },
        'next/server': { NextResponse: { json: Response.json } },
        bullmq: { Queue: class { constructor() { throw new Error('PER_REQUEST_QUEUE_FORBIDDEN') } } },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async (_request: unknown, required: string) => {
            assert.equal(required, 'ADMIN'); return role === 'ADMIN' ? { user: { id: 'admin' } } : { error: 'Denied', status: role ? 403 : 401 }
        } },
        '@/lib/prisma': { prisma: { beinAccount: { findUnique: async () => { calls.push('account'); return { id: 'account-a', isActive: settings.active, automationExclusive: settings.exclusive } } } } },
        '@/lib/redis': { default: {} },
        '@/lib/queue': { operationsQueue: { add: async (_name: string, data: { balanceRequestId: string; accountId: string }, options: { attempts: number; jobId: string }) => {
            calls.push('queue'); assert.equal(data.balanceRequestId, request.requestId); assert.equal(data.accountId, 'account-a');
            assert.equal(options.attempts, 1); assert.ok(options.jobId.includes(request.requestId));
            if (settings.queueFails) throw new Error('private queue delivery uncertain')
        } } },
        '../../../../../../../shared/bein/balance-refresh': contract,
        '../../../../../../../shared/bein/balance-refresh-store': store,
    })
    const req = (body: string | undefined = '{"mode":"async"}', query = '') => {
        const url = new URL(`http://localhost/api/admin/bein-accounts/account-a/check-balance${query}`)
        return Object.assign(new Request(url, body === undefined ? {} : { method: 'POST', body }), { nextUrl: url })
    }
    return { ...api, request, settings, calls, req, context: { params: Promise.resolve({ id: 'account-a' }) } }
}

for (const role of [null, 'USER', 'MANAGER', 'AGENT']) test(`balance refresh denies ${role} before account/store/queue access`, async () => {
    const h = fixture(role)
    assert.equal((await h.POST(h.req(), h.context)).status, role ? 403 : 401)
    assert.equal((await h.GET(h.req(undefined, '?active=1'), h.context)).status, role ? 403 : 401)
    assert.deepEqual(h.calls, [])
})

test('async returns 202 and repeated admission never queues a second job', async () => {
    const h = fixture()
    const first = await h.POST(h.req(), h.context)
    assert.equal(first.status, 202)
    assert.equal((await first.json()).data.requestId, h.request.requestId)
    h.settings.created = false
    assert.equal((await h.POST(h.req(), h.context)).status, 202)
    assert.equal(h.calls.filter(call => call === 'queue').length, 1)
})

test('status is bound to account, hides owner token, and active lookup never enqueues', async () => {
    const h = fixture(); h.request.runToken = 'private-owner'
    assert.equal((await h.GET(h.req(undefined, '?requestId=synthetic-request'), { params: Promise.resolve({ id: 'other' }) })).status, 404)
    h.settings.active = false
    const response = await h.GET(h.req(undefined, '?active=1'), h.context)
    assert.equal(response.status, 200)
    assert.equal('runToken' in (await response.json()).data, false)
    assert.equal(h.calls.includes('queue'), false)
})

test('invalid modes and ineligible accounts are rejected before admission', async () => {
    const h = fixture()
    assert.equal((await h.POST(h.req('{"mode":"invalid"}'), h.context)).status, 400)
    h.settings.exclusive = false
    assert.equal((await h.POST(h.req(), h.context)).status, 409)
    assert.equal(h.calls.includes('admit'), false)
})

test('unacknowledged enqueue preserves request identity and status outage is not an empty result', async () => {
    const h = fixture(); h.settings.queueFails = true
    const response = await h.POST(h.req(), h.context)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).requestId, h.request.requestId)
    assert.equal(h.request.state, 'QUEUED')
    h.settings.storeFails = true
    assert.equal((await h.GET(h.req(undefined, '?active=1'), h.context)).status, 503)
})

test('legacy empty-body response uses attributed terminal observation, never a DB timestamp', async () => {
    const h = fixture(); h.request.state = 'COMPLETED'; h.request.balance = 12.5; h.request.updatedAt = new Date().toISOString()
    const response = await h.POST(h.req(''), h.context)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.balance, 12.5)
    assert.equal(body.updatedAt, h.request.updatedAt)
    assert.equal(h.calls.filter(call => call === 'account').length, 1)
})
