import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PanelCommandState } from '../../src/lib/panel-command-state'
import { PanelCommandRunner } from '../../src/lib/panel-command-runner'

const command = (attempt: string, resource = 'user/a') => ({
    action: 'balance', resources: [resource], attempt, url: '/synthetic',
    init: { method: 'PATCH', body: '{"amount":1}' },
})
function owner(send: typeof fetch, timeout = 50) {
    const state = new PanelCommandState('actor', { getItem: () => null, setItem: () => {} })
    return new PanelCommandRunner(state, send, timeout)
}

test('claims before dispatch; separate resources run while the first response is pending', async () => {
    let release!: (response: Response) => void
    let calls = 0
    const runner = owner(async () => { calls++; return calls === 1 ? new Promise(resolve => { release = resolve }) : Response.json({ success: true }) })
    const first = runner.request(command('a'))
    await assert.rejects(runner.request(command('duplicate')), /COMMAND_CONFLICT/)
    assert.equal((await runner.request(command('b', 'user/b'))).status, 200)
    release(Response.json({ success: true }))
    await first
    assert.equal(calls, 2)
})

test('browser caller abort does not cancel the owned command', async () => {
    const controller = new AbortController()
    const runner = owner(async (_url, init) => { assert.equal(init?.signal?.aborted, false); return Response.json({ success: true }) })
    controller.abort()
    await runner.request({ ...command('a'), init: { ...command('a').init, signal: controller.signal } })
    assert.equal(runner.state.snapshot()[0].state, 'SUCCEEDED')
})

test('body timeout and late completion cannot clear uncertainty or replay', async () => {
    let calls = 0
    const runner = owner(async () => {
        calls++
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) } }))
    }, 10)
    await assert.rejects(runner.request(command('a')), /COMMAND_UNCONFIRMED/)
    assert.equal(runner.state.snapshot()[0].state, 'UNCERTAIN')
    await assert.rejects(runner.request(command('b')), /COMMAND_CONFLICT/)
    assert.equal(calls, 1)
})

test('only an explicit pre-effect rejection releases failed transport responses', async () => {
    for (const status of [400, 409, 500]) {
        const runner = owner(async () => Response.json({ code: 'SYNTHETIC' }, { status }))
        await runner.request(command('a'))
        assert.equal(runner.state.snapshot()[0].state, 'UNCERTAIN')
    }
    const runner = owner(async () => Response.json({ code: 'VALIDATION_BEFORE_WRITE' }, { status: 400 }))
    await runner.request({ ...command('a'), knownRejection: (response, body) => response.status === 400 &&
        (body as { code: string }).code === 'VALIDATION_BEFORE_WRITE' })
    assert.equal(runner.state.snapshot()[0].state, 'FAILED')
})

test('bad bodies remain uncertain and storage denial sends nothing', async () => {
    const runner = owner(async () => new Response('broken'))
    await assert.rejects(runner.request(command('a')), /COMMAND_UNCONFIRMED/)
    let calls = 0
    const state = new PanelCommandState('actor', { getItem: () => null, setItem: () => { throw new Error('denied') } })
    const blocked = new PanelCommandRunner(state, async () => { calls++; return Response.json({}) })
    await assert.rejects(blocked.request(command('a')), /COMMAND_STORAGE_UNAVAILABLE/)
    assert.equal(calls, 0)
})

test('an HTTP 200 business failure does not become a success receipt', async () => {
    const runner = owner(async () => Response.json({ success: false }))
    await runner.request(command('a'))
    assert.equal(runner.state.snapshot()[0].state, 'UNCERTAIN')
})
