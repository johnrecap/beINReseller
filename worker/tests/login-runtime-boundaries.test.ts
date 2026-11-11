import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'

function imports(path: string) {
    return Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
}

test('session cache distinguishes missing state from unavailable Redis and never grants a login lock on error', async () => {
    const path = 'worker/src/lib/session-cache.ts'
    let unavailable = false
    const read = async () => { if (unavailable) throw new Error('synthetic outage'); return null }
    const api = loadIsolatedModule<typeof import('../src/lib/session-cache')>(path, { ...imports(path),
        './redis': { getRedisConnection: () => ({ get: read, set: read, exists: read }) } })
    assert.equal(await api.getSessionFromCache('a', 'direct'), null)
    assert.equal(await api.acquireLoginLock('a', 'owner'), false)
    assert.equal(await api.waitForLoginComplete('a'), true)
    unavailable = true
    await assert.rejects(api.getSessionFromCache('a', 'direct'), /PROVIDER_SESSION_CACHE_UNAVAILABLE/)
    await assert.rejects(api.acquireLoginLock('a', 'owner'), /PROVIDER_LOGIN_LOCK_UNAVAILABLE/)
    await assert.rejects(api.waitForLoginComplete('a'), /PROVIDER_LOGIN_LOCK_UNAVAILABLE/)
})

for (const cycleDuration of [460_000, 700_000]) test(`KeepAlive counts ${cycleDuration}ms cycle time toward its interval without overlap`, async () => {
    const path = 'worker/src/lib/session-keepalive.ts'
    let now = 0
    const timers: { callback(): Promise<void>; ms: number }[] = []
    const api = loadIsolatedModule<{ SessionKeepAliveService: new () => {
        start(): void; stop(): void; loadConfig(): Promise<void>; refreshAllSessions(): Promise<unknown>
    } }>(path, { ...imports(path), './redis': { getRedisConnection: () => ({}) } }, [], {}, {
        Date: class extends Date { static now() { return now } },
        setTimeout: (callback: () => Promise<void>, ms: number) => { timers.push({ callback, ms }); return timers.length },
        clearTimeout: () => {},
    })
    const service = new api.SessionKeepAliveService()
    service.loadConfig = async () => {}
    service.refreshAllSessions = async () => { assert.equal(timers.length, 1); now += cycleDuration; return { success: 47, total: 47 } }
    service.start()
    assert.equal(timers[0].ms, 600_000)
    await timers[0].callback()
    assert.equal(timers[1].ms, Math.max(0, 600_000 - cycleDuration))
    service.stop()
})

test('2Captcha uses HTTPS, polls at five seconds and returns the supplied solution', async () => {
    const { solver, urls, waits } = solverFixture([{ status: 1, request: 'id' },
        { status: 0, request: 'CAPCHA_NOT_READY' }, { status: 1, request: ' answer ' }])
    assert.equal(await solver.solve('iVBORw0KGgo='), 'answer')
    assert.ok(urls.every(url => url.startsWith('https://2captcha.com/')))
    assert.deepEqual(waits, [5000, 5000])
})

for (const response of [{ status: 0, request: 'ERROR_ZERO_BALANCE' }, { status: 0, request: '<secret html>' },
    '<secret html>', new Error('network secret')]) test(`solver failure ${typeof response} is safe and performs no polling`, async () => {
    const { solver, waits } = solverFixture([response])
    await assert.rejects(solver.solve('iVBORw0KGgo='), error => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /^(ERROR_ZERO_BALANCE|CAPTCHA_SOLVER_(REJECTED|INVALID_RESPONSE|UNAVAILABLE))$/)
        return true
    })
    assert.equal(waits.length, 0)
})

test('solver total deadline terminates repeated not-ready responses', async () => {
    const { solver, waits } = solverFixture([{ status: 1, request: 'id' }, { status: 0, request: 'CAPCHA_NOT_READY' }])
    await assert.rejects(solver.solve('iVBORw0KGgo='), /CAPTCHA_SOLVER_TIMEOUT/)
    assert.equal(waits.reduce((a, b) => a + b, 0), 60_000)
})

function solverFixture(responses: unknown[]) {
    const path = 'worker/src/utils/captcha-solver.ts'
    let now = 0, request = 0
    const urls: string[] = [], waits: number[] = []
    const api = loadIsolatedModule<typeof import('../src/utils/captcha-solver')>(path, {
        'node:timers/promises': { setTimeout: async (ms: number) => { waits.push(ms); now += ms } },
    }, [], {}, { Buffer, Date: class extends Date { static now() { return now } },
        fetch: async (url: string, options: RequestInit) => {
            urls.push(url)
            assert.ok(options.signal, 'all requests share a bounded abort signal')
            const response = responses[Math.min(request++, responses.length - 1)]
            if (response instanceof Error) throw response
            return { ok: true, json: async () => response }
        } })
    return { solver: new api.CaptchaSolver('synthetic'), urls, waits }
}
