import test from 'node:test'
import assert from 'node:assert/strict'
import { requestPrePayOperationExpiry } from '@/lib/operations/client-timeout'

test('package timer expiry requests server-side pre-Pay expiry and lock release', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init || {} })
        return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

    const ok = await requestPrePayOperationExpiry('operation-1', fetcher)

    assert.equal(ok, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/operations/operation-1/heartbeat')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.keepalive, true)
    assert.equal(calls[0].init.body, JSON.stringify({ unloading: true }))
})
