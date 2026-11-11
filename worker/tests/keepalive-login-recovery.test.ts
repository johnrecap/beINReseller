import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as routes from '../src/lib/bein-connection-mode'
import { isCredentialLoginFailure, loginHttpFailure, loginMessageFailure } from '../../shared/bein/login-failure'

function fixture(result: any = loginHttpFailure(402), attempted = true, failCaptchaSave = false) {
    const path = 'worker/src/lib/session-keepalive.ts'
    const deps: Record<string, any> = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    const saved: any[] = [], failures: any[] = [], logins: string[] = [], clients: string[] = []
    const health: any[] = []
    const cached = new Set(['b', 'c'])
    let owner = 'keepalive-owner', mode = 'server_ip'
    const redis = { get: async () => owner }
    Object.assign(deps, {
        './prisma': { prisma: { setting: { findUnique: async ({ where }: any) => where.key.includes('captcha') ? (failCaptchaSave ? { value: 'synthetic' } : null) : ({ value: mode }) } } },
        '../utils/captcha-solver': { CaptchaSolver: class { async solve() { return 'synthetic' } } },
        './crypto': { decryptAccountPassword: (account: unknown) => account },
        './bein-connection-mode': routes,
        './redis': { getRedisConnection: () => redis },
        './bein-login-tracking': { shouldCountAsCredentialFailure: isCredentialLoginFailure,
            recordLoginHealthFailure: async (...args: unknown[]) => { health.push(args); return true },
            recordLoginFailure: async (...args: unknown[]) => { failures.push(args) }, recordLoginSuccess: async () => {} },
        './session-cache': {
            getSessionTTL: async (id: string) => cached.has(id) ? 900 : 0,
            getSessionFromCache: async (id: string) => cached.has(id) ? { accountId: id, cookies: id, viewState: { purchase: 'private' } } : null,
            saveSessionToCache: async (...args: any[]) => { if (failCaptchaSave) throw new Error('SYNTHETIC_CACHE_FAILURE'); assert.equal(args[4].owner, owner); saved.push(args) },
        },
        '../http/HttpClientService': { HttpClientService: class {
            active = false
            constructor(proxy: unknown, readonly id: string) { assert.equal(proxy, undefined); clients.push(id) }
            async initialize() {} async reloadConfig() {} isSessionActive() { return this.active }
            async importSession(session: any) { assert.equal(session.accountId, this.id); assert.equal(session.viewState, undefined) }
            markSessionValidFromCache() { this.active = true }
            resetSession() { this.active = false }
            async validateSession() { return this.active }
            getSessionTimeout() { return 15 }
            async exportSession() { return { accountId: this.id, cookies: this.id } }
            getLoginTrackingRevision() { return new Date(0) }
            didAttemptLogin() { return attempted }
            async login() { logins.push(this.id); return this.id === 'a' ? result : { success: true } }
            async submitLogin() { return { success: true } }
        } },
    })
    const api = loadIsolatedModule<any>(path, deps)
    const service = new api.SessionKeepAliveService()
    const refresh = (id: string) => service.refreshSessionWithGuard({ id, username: id, password: 'synthetic',
        proxyId: 'old-proxy', proxy: { id: 'old-proxy', host: '127.0.0.1', port: 9 } }, 'keepalive-owner')
    return { refresh, saved, failures, health, logins, clients, cached, loseOwner: () => { owner = 'admin-recovery-owner' }, setMode: (value: string) => { mode = value } }
}

test('KeepAlive uses current direct mode: one 402 does not affect two valid account sessions', async () => {
    const f = fixture()
    const results = await Promise.all(['a', 'b', 'c'].map(f.refresh))
    assert.deepEqual(results.map(r => r.status), ['failed', 'refreshed', 'refreshed'])
    assert.deepEqual(f.failures, [])
    assert.deepEqual(f.saved.map(row => row[0]).sort(), ['b', 'c'])
    assert.ok(f.saved.every(row => row[2].accountId === row[0] && row[1] === 'direct'))
})

test('KeepAlive cannot resurrect a deleted reusable session from its prior cycle', async () => {
    const f = fixture()
    await f.refresh('b')
    f.cached.delete('b')
    await f.refresh('b')
    assert.deepEqual(f.clients, ['b', 'b'])
    assert.deepEqual(f.logins, ['b'])
})

test('KeepAlive losing ownership cannot write a late cache result', async () => {
    const f = fixture()
    f.loseOwner()
    await assert.rejects(f.refresh('b'), /KEEPALIVE_ACCOUNT_GUARD_LOST/)
    assert.deepEqual(f.saved, [])
    assert.deepEqual(f.failures, [])
})

test('KeepAlive passes all terminal categories and actual-attempt context to the common health writer', async () => {
    for (const result of [loginHttpFailure(402), loginHttpFailure(429), loginMessageFailure(), loginMessageFailure('Invalid username or password')]) {
        const f = fixture(result)
        await f.refresh('a')
        assert.equal(f.health.length, 1)
        assert.equal(f.health[0][1].failureCategory, result!.failureCategory)
        assert.equal(f.health[0][3].attempted, true)
        assert.equal(f.health[0][3].terminal, true)
        assert.equal(f.saved.length, 0)
    }
    const local = fixture(loginMessageFailure(), false)
    await local.refresh('a')
    assert.equal(local.health[0][3].attempted, false)
    assert.equal(local.health[0][3].terminal, true)
})

test('successful CAPTCHA login followed by cache failure never quarantines or retries authentication', async () => {
    const f = fixture({ ...loginMessageFailure('CAPTCHA'), requiresCaptcha: true, captchaImage: 'synthetic' }, true, true)
    await assert.rejects(f.refresh('a'), /SYNTHETIC_CACHE_FAILURE/)
    assert.equal(f.health.length, 0)
    assert.equal(f.logins.length, 1)
})
