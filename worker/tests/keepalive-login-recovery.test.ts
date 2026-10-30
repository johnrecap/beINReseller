import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as routes from '../src/lib/bein-connection-mode'
import { isCredentialLoginFailure, loginHttpFailure } from '../../shared/bein/login-failure'

function fixture() {
    const path = 'worker/src/lib/session-keepalive.ts'
    const deps: Record<string, any> = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    const saved: any[] = [], failures: any[] = [], logins: string[] = [], clients: string[] = []
    const cached = new Set(['b', 'c'])
    let owner = 'keepalive-owner', mode = 'server_ip'
    const redis = { get: async () => owner }
    Object.assign(deps, {
        './prisma': { prisma: { setting: { findUnique: async () => ({ value: mode }) } } },
        './crypto': { decryptAccountPassword: (account: unknown) => account },
        './bein-connection-mode': routes,
        './redis': { getRedisConnection: () => redis },
        './bein-login-tracking': { shouldCountAsCredentialFailure: isCredentialLoginFailure,
            recordLoginFailure: async (...args: unknown[]) => { failures.push(args) }, recordLoginSuccess: async () => {} },
        './session-cache': {
            getSessionTTL: async (id: string) => cached.has(id) ? 900 : 0,
            getSessionFromCache: async (id: string) => cached.has(id) ? { accountId: id, cookies: id, viewState: { purchase: 'private' } } : null,
            saveSessionToCache: async (...args: any[]) => { assert.equal(args[4].owner, owner); saved.push(args) },
        },
        '../http/HttpClientService': { HttpClientService: class {
            active = false
            constructor(proxy: unknown, readonly id: string) { assert.equal(proxy, undefined); clients.push(id) }
            async initialize() {} async reloadConfig() {} isSessionActive() { return this.active }
            async importSession(session: any) { assert.equal(session.accountId, this.id); assert.equal(session.viewState, undefined) }
            markSessionValidFromCache() { this.active = true }
            resetSession() { this.active = false }
            async validateSession() { return this.active }
            async exportSession() { return { accountId: this.id, cookies: this.id } }
            getLoginTrackingRevision() { return new Date(0) }
            async login() { logins.push(this.id); return this.id === 'a' ? loginHttpFailure(402) : { success: true } }
        } },
    })
    const api = loadIsolatedModule<any>(path, deps)
    const service = new api.SessionKeepAliveService()
    const refresh = (id: string) => service.refreshSessionWithGuard({ id, username: id, password: 'synthetic',
        proxyId: 'old-proxy', proxy: { id: 'old-proxy', host: '127.0.0.1', port: 9 } }, 'keepalive-owner')
    return { refresh, saved, failures, logins, clients, cached, loseOwner: () => { owner = 'admin-recovery-owner' }, setMode: (value: string) => { mode = value } }
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
