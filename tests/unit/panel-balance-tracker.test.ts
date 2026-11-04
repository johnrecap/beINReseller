import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PanelCommandState } from '../../src/lib/panel-command-state'
import { PanelBalanceTracker } from '../../src/lib/panel-balance-tracker'

function fixture() {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const state = new PanelCommandState('admin', storage)
    const calls: string[] = []
    let response = { requestId: 'remote', accountId: 'a', state: 'QUEUED', createdAt: 1, deadline: Date.now() + 300_000 }
    const send = async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method || 'GET'} ${url}`)
        return Response.json({ success: true, data: response }, { status: init?.method === 'POST' ? 202 : 200 })
    }
    return { state, storage, calls, send, complete: () => { response = { ...response, state: 'COMPLETED', balance: 12, updatedAt: new Date().toISOString() } as typeof response } }
}

test('balance acceptance remains pending, polling settles the exact receipt and shares resource conflicts', async () => {
    const h = fixture(); const tracker = new PanelBalanceTracker(h.state, h.send as typeof fetch)
    await tracker.start('a', 'attempt')
    assert.equal(h.state.snapshot()[0].state, 'PENDING')
    assert.throws(() => h.state.claim('bein.edit', ['beinAccount/a'], 'edit'), /COMMAND_CONFLICT/)
    h.complete(); await tracker.tick()
    assert.equal(h.state.snapshot()[0].state, 'SUCCEEDED')
    assert.equal(tracker.observation('a')?.balance, 12)
    assert.equal(h.calls.filter(c => c.startsWith('POST')).length, 1)
})

test('same-tab reload resumes status without replaying POST; no payload or balance is persisted', async () => {
    const h = fixture(); await new PanelBalanceTracker(h.state, h.send as typeof fetch).start('a', 'attempt')
    assert.doesNotMatch(h.storage.getItem('panel-commands:v1:admin')!, /"balance":|password|"body":/)
    const restored = new PanelCommandState('admin', h.storage)
    h.complete(); await new PanelBalanceTracker(restored, h.send as typeof fetch).tick()
    assert.equal(restored.snapshot()[0].state, 'SUCCEEDED')
    assert.equal(h.calls.filter(c => c.startsWith('POST')).length, 1)
    assert.doesNotMatch(h.storage.getItem('panel-commands:v1:admin')!, /balance|password|body/)
})

test('404 and lost replies stay uncertain; polls never overlap or replay', async () => {
    const h = fixture(); let release: () => void = () => {}
    const send = async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') throw new Error('lost response')
        h.calls.push('GET'); await new Promise<void>(resolve => { release = resolve })
        return Response.json({ code: 'REQUEST_NOT_FOUND' }, { status: 404 })
    }
    const tracker = new PanelBalanceTracker(h.state, send as typeof fetch)
    await tracker.start('a', 'attempt')
    const first = tracker.tick(); await Promise.resolve(); await tracker.tick(); release(); await first
    assert.equal(h.calls.length, 1)
    assert.equal(h.state.snapshot()[0].state, 'UNCERTAIN')
    await tracker.tick(); assert.equal(h.calls.length, 1)
})

test('foreign account or request identity cannot settle the claimed resource', async () => {
    for (const changed of [{ accountId: 'other' }, { requestId: 'other' }]) {
        const h = fixture(); await new PanelBalanceTracker(h.state, h.send as typeof fetch).start('a', 'attempt')
        const tracker = new PanelBalanceTracker(h.state, (async () => Response.json({ success: true, data: {
            accountId: 'a', requestId: 'remote', state: 'COMPLETED', balance: 8, updatedAt: new Date().toISOString(), ...changed,
        } })) as typeof fetch)
        await tracker.tick()
        assert.equal(h.state.snapshot()[0].state, 'UNCERTAIN')
        assert.equal(tracker.observation('a'), undefined)
    }
})

test('explicit status retry resumes a stopped read without POST or releasing another action', async () => {
    const h = fixture(); let missing = true
    const send = async (url: string, init?: RequestInit) => {
        if (!init?.method && missing) { h.calls.push('GET missing'); return Response.json({}, { status: 404 }) }
        return h.send(url, init)
    }
    const tracker = new PanelBalanceTracker(h.state, send as typeof fetch)
    await tracker.start('a', 'display'); await tracker.tick()
    assert.equal(h.state.snapshot()[0].state, 'UNCERTAIN')
    h.complete(); missing = false
    await tracker.retryStatus('display')
    assert.equal(h.state.snapshot()[0].state, 'SUCCEEDED')
    assert.equal(h.calls.filter(c => c.startsWith('POST')).length, 1)
    h.state.claim('user.balance', ['user/a'], 'financial'); h.state.settle('financial', 'UNCERTAIN')
    await tracker.retryStatus('financial')
    assert.equal(h.state.snapshot().find(r => r.attempt === 'financial')?.state, 'UNCERTAIN')
})

test('balance reconciliation cannot release financial uncertainty; logout stops polling', async () => {
    const h = fixture(); h.state.claim('user.balance', ['user/a'], 'financial'); h.state.settle('financial', 'UNCERTAIN')
    assert.equal(h.state.updateBalanceRead('financial', 'a', 'SUCCEEDED', 'fake'), false)
    await new PanelBalanceTracker(h.state, h.send as typeof fetch).start('a', 'display')
    const tracker = new PanelBalanceTracker(h.state, h.send as typeof fetch)
    tracker.dispose(); await tracker.tick()
    assert.equal(h.calls.length, 1)
    assert.equal(h.state.snapshot().find(r => r.attempt === 'financial')?.state, 'UNCERTAIN')
})

test('an expired receipt releases only after an authenticated active lookup confirms no work', async () => {
    const h = fixture()
    await new PanelBalanceTracker(h.state, h.send as typeof fetch).start('a', 'display')
    let active: object | null = { requestId:'other', accountId:'a', state:'RUNNING' }
    const urls: string[] = []
    const tracker = new PanelBalanceTracker(h.state, (async (url: string) => {
        urls.push(url)
        return url.endsWith('?active=1') ? Response.json({ success:true, data:active }) :
            Response.json({ code:'REQUEST_NOT_FOUND' }, { status:404 })
    }) as typeof fetch)
    await tracker.tick()
    assert.equal(h.state.snapshot()[0].state, 'UNCERTAIN')
    active = null
    await tracker.tick()
    assert.equal(h.state.snapshot()[0].state, 'FAILED')
    assert.equal(tracker.failure('a'), 'REQUEST_NOT_FOUND')
    assert.equal(urls.filter(u => u.endsWith('?active=1')).length, 2)
    assert.doesNotThrow(() => h.state.claim('bein.balance.refresh', ['beinAccount/a'], 'next'))
})
