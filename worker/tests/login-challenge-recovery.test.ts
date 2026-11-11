import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { OperationStatus, Prisma } from '@prisma/client'
import { HttpClientService } from '../src/http/HttpClientService'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as routes from '../src/lib/bein-connection-mode'
import * as failureTypes from '../../shared/bein/login-failure'
import * as healthPolicy from '../../shared/bein/login-health'

const form = (state: string, error = '') => `<title>Dealer Login</title><input name="__VIEWSTATE" id="__VIEWSTATE" value="${state}"><input id="Login1_UserName"><input name="Login1$Password"><img id="captcha" src="data:image/png;base64,AA==">${error}`
const authenticated = '<a href="logout">Logout</a>'
const account = { id: 'a', username: 'synthetic', password: 'synthetic', isActive: true, automationExclusive: true }

function imports(path: string) {
    return Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
}

// HTTP and SQL are the boundaries. The real parser, health policy and orchestrators are composed below.
function fixture(responses: string[], options: { missingKey?: boolean; solverFailure?: boolean; loseDuringSolve?: boolean } = {}) {
    const posts: URLSearchParams[] = []
    const state = { active: true, credentialFailures: 0, healthWrites: 0, saves: 0, solves: 0, loginGets: 0, reason: '', owner: 'owner', loseAfterPost: false }
    const revision = new Date(0)
    const tracking = loadIsolatedModule<typeof import('../src/lib/bein-login-tracking')>('worker/src/lib/bein-login-tracking.ts', {
        './prisma': { prisma: { $executeRaw: async (_sql: unknown, increment: number, disable: boolean, reason: string) => {
            state.healthWrites++; state.credentialFailures += increment; if (disable) state.active = false; state.reason = reason; return 1
        }, $queryRaw: async () => [{ updatedAt: revision }] } },
        '../../../shared/bein/login-failure': failureTypes, '../../../shared/bein/login-health': healthPolicy,
    })
    const client = Object.assign(Object.create(HttpClientService.prototype), {
        accountId: 'a', reportReadScope: false, currentViewState: null, sessionValid: false, sessionExpiresAt: 0,
        // Existing fixture seam substitutes only the DB revision lookup, never authentication decisions.
        captureLoginTrackingRevision: async function () { this.loginTrackingRevision = revision },
        config: { loginUrl: 'https://provider.invalid/login', soldPackagesReportUrl: 'https://provider.invalid/report', selCaptchaImg: 'captcha', sessionTimeout: 15 },
        initialize: async () => {}, reloadConfig: async () => {}, resetSession: function () { this.invalidateSession() },
        exportSession: async () => ({ accountId: 'a', cookies: 'synthetic' }),
        axios: { interceptors: { request: { use: () => {} } },
            get: async (url: string) => {
                if (url.includes('ipify')) return { status: 200, data: { ip: '192.0.2.1' } }
                state.loginGets++; return { status: 200, data: form('initial-state') }
            },
            post: async (_url: string, body: string) => {
                posts.push(new URLSearchParams(body))
                if (state.loseAfterPost) state.owner = 'admin-recovery-owner'
                return { status: 200, data: responses[Math.min(posts.length - 1, responses.length - 1)] }
            } },
    }) as HttpClientService
    const path = 'worker/src/lib/session-keepalive.ts'
    const api = loadIsolatedModule<{ SessionKeepAliveService: new () => {
        refreshSessionWithGuard(row: typeof account, owner: string): Promise<{ status: string; error?: string }>
    } }>(path, { ...imports(path),
        './prisma': { prisma: { setting: { findUnique: async ({ where }: { where: { key: string } }) => ({ value: where.key.includes('captcha') ? (options.missingKey ? '' : 'synthetic-key') : 'server_ip' }) } } },
        '../utils/captcha-solver': { CaptchaSolver: class { async solve() {
            state.solves++;
            if (options.loseDuringSolve) state.owner = 'admin-recovery-owner';
            if (options.solverFailure) throw new Error('ERROR_ZERO_BALANCE');
            return 'synthetic-solution';
        } } },
        './crypto': { decryptAccountPassword: (row: unknown) => row }, './bein-connection-mode': routes,
        './redis': { getRedisConnection: () => ({ get: async () => state.owner }) }, './bein-login-tracking': tracking,
        './session-cache': { getSessionTTL: async () => 0, getSessionFromCache: async () => null, saveSessionToCache: async () => { state.saves++ } },
        '../http/HttpClientService': { HttpClientService: class { constructor() { return client } } },
    })
    return { client, tracking, posts, state, keepalive: () => new api.SessionKeepAliveService().refreshSessionWithGuard(account, 'owner') }
}

for (const options of [{ missingKey: true }, { solverFailure: true }]) {
    test(`2026-11-11: solver infrastructure failure never quarantines a provider account: ${JSON.stringify(options)}`, async () => {
        const f = fixture([authenticated], options);
        assert.equal((await f.keepalive()).status, 'failed');
        assert.equal(f.posts.length, 0);
        assert.equal(f.state.active, true);
        assert.equal(f.state.healthWrites, 0);
        assert.equal(f.state.saves, 0);
    });
}

test('ownership lost while solving prevents the provider POST itself', async () => {
    const f = fixture([authenticated], { loseDuringSolve: true });
    await assert.rejects(f.keepalive(), /KEEPALIVE_ACCOUNT_GUARD_LOST/);
    assert.equal(f.posts.length, 0);
    assert.equal(f.state.healthWrites, 0);
    assert.equal(f.state.saves, 0);
});

test('KeepAlive completes renewed CAPTCHA with matching state instead of quarantining a valid account', async () => {
    const f = fixture([form('renewed-state'), authenticated])
    assert.equal((await f.keepalive()).status, 'logged_in')
    assert.equal(f.posts.length, 2)
    assert.equal(f.posts[1].get('__VIEWSTATE'), 'renewed-state')
    assert.equal(f.state.active, true)
    assert.equal(f.state.healthWrites, 0)
    assert.equal(f.state.saves, 1)
})

test('KeepAlive exhausts exactly three challenges and quarantines once without counting password failures', async () => {
    const f = fixture([form('renewed-state')])
    assert.equal((await f.keepalive()).status, 'failed')
    assert.equal(f.posts.length, 3)
    assert.equal(f.state.healthWrites, 1)
    assert.equal(f.state.active, false)
    assert.equal(f.state.credentialFailures, 0)
    assert.equal(f.state.reason, 'LOGIN_HEALTH_V1:CAPTCHA_EXHAUSTED')
    assert.equal(f.state.saves, 0)
})

test('KeepAlive reports one actual attempt when explicit credentials are rejected', async () => {
    const f = fixture([form('renewed-state', '<span style="color:Red">Invalid username or password</span>')])
    const outcome = await f.keepalive()
    assert.equal(f.posts.length, 1)
    assert.equal(f.state.credentialFailures, 1)
    assert.equal(f.state.active, false)
    assert.doesNotMatch(outcome.error || '', /3 attempts/)
})

test('ownership lost during challenge submission prevents late health and session writes', async () => {
    const f = fixture([authenticated])
    f.state.loseAfterPost = true
    await assert.rejects(f.keepalive(), /KEEPALIVE_ACCOUNT_GUARD_LOST/)
    assert.equal(f.state.healthWrites, 0)
    assert.equal(f.state.saves, 0)
    assert.equal(f.state.active, true)
})

test('report challenge fails the read without a credential POST or account quarantine', async () => {
    const f = fixture([authenticated])
    const path = 'worker/src/lib/provider-report-reader.ts'
    const api = loadIsolatedModule<typeof import('../src/lib/provider-report-reader')>(path, { ...imports(path), 'node:crypto': { randomUUID: () => 'synthetic' },
        './bein-login-tracking': f.tracking }, [], {}, { setInterval: () => 1, clearInterval: () => {} })
    const runtime = { account: async () => account, reserved: async () => false, acquire: async () => true,
        assertOwner: async () => {}, renew: async () => true, release: async () => {}, client: async () => f.client,
        recordLoginResult: api.providerReportRuntime({} as Parameters<typeof api.providerReportRuntime>[0], 'worker', async () => f.client).recordLoginResult }
    await assert.rejects(api.readProviderReport({ id: 'r', accountId: 'a', from: '2026-11-01', to: '2026-11-09' },
        runtime as Parameters<typeof api.readProviderReport>[1], new AbortController().signal), /CAPTCHA_REQUIRED/)
    assert.equal(f.posts.length, 0)
    assert.equal(f.state.active, true)
    assert.equal(f.state.healthWrites, 0)
})

async function reLogin(f: ReturnType<typeof fixture>) {
    const path = 'worker/src/http-queue-processor.ts'
    const api = loadIsolatedModule<typeof import('../src/http-queue-processor')>(path, { ...imports(path), '@prisma/client': { OperationStatus, Prisma },
        './lib/redis': { getRedisConnection: () => ({}) } }, ['performReLogin'])
    const runtime = { assertExecutionLeaseCurrent: async () => {}, getCaptchaApiKey: async () => 'synthetic',
        solveCaptcha: async () => 'synthetic', trackCredentialLoginFailure: async (_id: string, failure: unknown, rev: Date, context: healthPolicy.LoginHealthContext) => {
            if (context.terminal) await f.tracking.recordLoginHealthFailure('a', failure, rev, context)
        }, trackFreshLoginSuccess: async () => {}, saveSessionToCacheFenced: async () => { f.state.saves++; return true } }
    return api.performReLogin(f.client, account as Parameters<typeof api.performReLogin>[1],
        { mode: 'server_ip', routeKey: 'direct' } as Parameters<typeof api.performReLogin>[2], 'read',
        { accountId: 'a' } as Parameters<typeof api.performReLogin>[4], runtime)
}

test('re-login consumes renewed CAPTCHA within its three-attempt budget and saves only after success', async () => {
    const f = fixture([form('renewed-state'), authenticated])
    assert.equal(await reLogin(f), true)
    assert.equal(f.posts.length, 2)
    assert.equal(f.posts[1].get('__VIEWSTATE'), 'renewed-state')
    assert.equal(f.state.loginGets, 1)
    assert.equal(f.state.active, true)
    assert.equal(f.state.saves, 1)
})

test('re-login exhausts three renewed challenges with exactly one terminal health write', async () => {
    const f = fixture([form('renewed-state')])
    await assert.rejects(reLogin(f), /Login failed after 3 attempts/)
    assert.equal(f.posts.length, 3)
    assert.equal(f.state.loginGets, 1)
    assert.equal(f.state.healthWrites, 1)
    assert.equal(f.state.reason, 'LOGIN_HEALTH_V1:CAPTCHA_EXHAUSTED')
    assert.equal(f.state.credentialFailures, 0)
    assert.equal(f.state.saves, 0)
})

function operationLogin(f: ReturnType<typeof fixture>, mode: 'auto' | 'manual' | 'timeout' | 'lost' | 'cancelled') {
    const path = 'worker/src/http-queue-processor.ts'
    const updates: Record<string, unknown>[] = []
    let now = 0, waiting = false, releases = 0
    const api = loadIsolatedModule<{ loginForOperation(input: {
        client: HttpClientService; account: typeof account; operationId: string; assertCurrent(): Promise<void>
    }): Promise<void> }>(path, { ...imports(path), '@prisma/client': { OperationStatus, Prisma },
        './lib/redis': { getRedisConnection: () => ({}) }, './lib/bein-login-tracking': f.tracking,
        './lib/session-cache': { releaseLoginLock: async () => { releases++ } },
        './utils/captcha-solver': { CaptchaSolver: class { async solve() {
            if (mode !== 'auto') throw new Error('synthetic solver unavailable');
            return 'synthetic';
        } } },
        './lib/prisma': { prisma: { setting: { findUnique: async () => ({ value: 'synthetic' }) }, operation: {
            updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); waiting = true; return { count: 1 } },
            findUnique: async () => ({ status: mode === 'cancelled' ? 'CANCELLED' : 'AWAITING_CAPTCHA',
                captchaSolution: mode === 'timeout' ? null : 'manual-solution' }),
        } } },
    }, ['loginForOperation'], {}, { Date: class extends Date { static now() { return now } },
        setTimeout: (callback: () => void, ms: number) => { now += ms; callback(); return 0 } })
    return { updates, releases: () => releases, run: () => api.loginForOperation({ client: f.client, account,
        operationId: 'synthetic-op', assertCurrent: async () => {
            if (mode === 'lost' && waiting) throw new Error('PROVIDER_EXECUTION_LEASE_LOST');
        } }) }
}

for (const mode of ['auto', 'manual'] as const) test(`interactive login completes a renewed challenge through ${mode}`, async () => {
    const f = fixture([form('renewed-state'), authenticated])
    const operation = operationLogin(f, mode)
    await operation.run()
    assert.equal(f.posts.length, 2)
    assert.equal(f.posts[1].get('__VIEWSTATE'), 'renewed-state')
    assert.equal(f.state.loginGets, 1)
    assert.equal(f.state.healthWrites, 0)
    assert.equal(f.state.active, true)
    if (mode === 'manual') {
        assert.equal(operation.updates.length, 2)
        assert.ok(operation.updates.every(row => row.captchaSolution === null), 'never reuse an earlier manual answer')
    }
})

for (const mode of ['timeout', 'lost', 'cancelled'] as const) test(`interactive ${mode} prevents a late credential POST and health update`, async () => {
    const f = fixture([authenticated])
    const operation = operationLogin(f, mode)
    await assert.rejects(operation.run(), mode === 'timeout' ? /CAPTCHA_TIMEOUT/ : mode === 'lost' ? /LEASE_LOST/ : /cancelled/i)
    assert.equal(f.posts.length, 0)
    assert.equal(f.state.healthWrites, 0)
    assert.equal(f.state.active, true)
    assert.equal(operation.releases(), 1)
})
