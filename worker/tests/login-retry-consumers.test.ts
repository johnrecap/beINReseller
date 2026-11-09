import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { OperationStatus, Prisma } from '@prisma/client'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import { isCredentialLoginFailure, loginHttpFailure } from '../../shared/bein/login-failure'
import { loginMessageFailure } from '../../shared/bein/login-failure'

test('re-login passes terminal typed outcomes, including an unsolvable CAPTCHA, to health tracking', async () => {
    const path = 'worker/src/http-queue-processor.ts'
    const deps: Record<string, any> = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    Object.assign(deps, { '@prisma/client': { OperationStatus, Prisma }, './lib/redis': { getRedisConnection: () => ({}) } })
    const api = loadIsolatedModule<any>(path, deps, ['performReLogin'])
    for (const outcome of [loginMessageFailure(), loginHttpFailure(429), { ...loginMessageFailure('CAPTCHA'), requiresCaptcha: true, captchaImage: 'synthetic' }]) {
        const records: any[] = []
        const client = { invalidateSession() {}, login: async () => outcome, getLoginTrackingRevision: () => new Date(0), didAttemptLogin: () => true }
        const runtime = { assertExecutionLeaseCurrent: async () => {}, getCaptchaApiKey: async () => null,
            trackCredentialLoginFailure: async (...args: unknown[]) => { records.push(args) }, captureSharedSessionGuard: async () => undefined }
        assert.equal(await api.performReLogin(client, { id: 'a', username: 'synthetic', password: 'synthetic' },
            { mode: 'server_ip', routeKey: 'direct' }, 'read', undefined, runtime), false)
        assert.equal(records.length, 1)
        assert.equal(records[0][1].failureCategory, outcome!.failureCategory)
        assert.equal(records[0][3].attempted, true)
        assert.equal(records[0][3].terminal, true)
    }
})

for (const thrown of [false, true]) test(`session-retry consumer cannot replay its operation after rejected login (thrown=${thrown})`, async () => {
    const path = 'worker/src/http-queue-processor.ts'
    const deps: Record<string, any> = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    Object.assign(deps, {
        '@prisma/client': { OperationStatus, Prisma },
        './pool/account-locking': { assertAccountExecutionLease: async () => true },
        './lib/redis': { getRedisConnection: () => ({}) },
        './lib/bein-login-tracking': { shouldCountAsCredentialFailure: isCredentialLoginFailure, recordLoginHealthFailure: async () => true },
    })
    const api = loadIsolatedModule<any>(path, deps, ['withSessionRetry'])
    let operationCalls = 0, loginCalls = 0
    const client = { invalidateSession() {}, login: async () => { loginCalls++; return loginHttpFailure(402) } }
    const action = async () => { operationCalls++; if (thrown) throw new Error('Session expired'); return { success: false, error: 'Session expired' } }
    await assert.rejects(api.withSessionRetry(client, { id: 'a', username: 'synthetic', password: 'synthetic' },
        { mode: 'server_ip', routeKey: 'direct' }, action, 'read', { accountId: 'a' }), /PROVIDER_LOGIN_UNAVAILABLE/)
    assert.equal(operationCalls, 1)
    assert.equal(loginCalls, 1)
})
