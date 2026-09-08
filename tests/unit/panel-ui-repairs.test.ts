import test from 'node:test'
import assert from 'node:assert/strict'
import { safePanelRedirect } from '../../src/lib/auth/safe-panel-redirect'
import { panelListQuery } from '../../src/lib/panel-list-query'
import { InMemoryLoginAttemptStore, recordFailedLoginAttempt, getLoginAttemptStatus } from '../../src/lib/auth/login-attempts'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as permissions from '../../src/lib/permissions'
import { authConfig } from '../../src/lib/auth.config'
import { ar } from '../../src/i18n/translations/ar'
import { en } from '../../src/i18n/translations/en'
import { bn } from '../../src/i18n/translations/bn'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('login redirect accepts only dashboard destinations on the same origin', () => {
    const origin = 'https://panel.example.test'
    for (const url of ['https://evil.test/dashboard', '//evil.test/dashboard', '/\\evil.test', 'javascript:alert(1)', '/login', '/dashboard-evil', '/dashboard/../login', '/dashboard\n', '']) {
        assert.equal(safePanelRedirect(url, origin), '/dashboard', url)
    }
    assert.equal(safePanelRedirect('/dashboard/history?q=one%20two#row', origin), '/dashboard/history?q=one%20two#row')
    assert.equal(safePanelRedirect(origin + '/dashboard/transactions?page=2', origin), '/dashboard/transactions?page=2')
})

test('concurrent login failures count atomically and cooldown does not extend', async () => {
    let now = 1_000
    const store = new InMemoryLoginAttemptStore(() => now)
    const input = { loginName: 'Synthetic+User', ip: '127.0.0.1', userAgent: 'isolated-test' }
    const options = { store, now: () => now }
    const results = await Promise.all(Array.from({ length: 20 }, () => recordFailedLoginAttempt(input, 'wrong_password', options)))
    assert.deepEqual(results.slice(0, 3).map(result => result.failedCount), [1, 2, 3])
    assert.equal((await getLoginAttemptStatus(input, options)).cooldownSeconds, 120)
    now += 30_000
    assert.equal((await recordFailedLoginAttempt(input, 'wrong_password', options)).cooldownSeconds, 90)
    now += 90_001
    assert.equal((await recordFailedLoginAttempt(input, 'wrong_password', options)).failedCount, 1)
})

test('server sorting validates bounds and the allowed column set', () => {
    for (const query of ['page=NaN', 'page=-1', 'page=1.5', 'limit=0', 'limit=101', 'page=999999999999', 'sortBy=password', 'sortOrder=wrong']) {
        assert.equal(panelListQuery(new URLSearchParams(query), ['createdAt', 'amount']), null, query)
    }
    assert.deepEqual(panelListQuery(new URLSearchParams('sortBy=amount&sortOrder=asc&page=2'), ['createdAt', 'amount']), {
        page: 2, limit: 10, sortBy: 'amount', sortOrder: 'asc',
    })
})

test('login middleware permits revoked cookies to reach the server login check', () => {
    const authorized = authConfig.callbacks.authorized as unknown as (input: unknown) => unknown
    assert.equal(authorized({ auth: { user: { id: 'old' } }, request: { nextUrl: new URL('https://panel.test/login') } }), true)
})

for (const state of ['deleted', 'inactive', 'password-changed', 'missing'] as const) {
    test(`fresh web session rejects ${state} before returning a user`, async () => {
        const api = loadIsolatedModule<{ getDbAuthenticatedUser(id: string, issued: number): Promise<unknown> }>('src/lib/auth-utils.ts', {
            './auth': {}, './permissions': permissions, './mobile-auth': {}, 'next/navigation': {}, 'next/server': {},
            './prisma': { default: { user: { findUnique: async () => state === 'missing' ? null : ({
                id: 'synthetic', username: 'synthetic', role: 'USER', balance: 0,
                isActive: state !== 'inactive', deletedAt: state === 'deleted' ? new Date() : null,
                passwordChangedAt: state === 'password-changed' ? new Date(2000) : null,
            }) } } },
        })
        assert.equal(await api.getDbAuthenticatedUser('synthetic', 1000), null)
    })
}

for (const route of ['transactions', 'notifications']) {
    test(`${route} rejects revoked web identity without trying a bearer fallback`, async () => {
        let reads = 0
        let bearerCalls = 0
        const api = loadIsolatedModule<{ GET(request: Request): Promise<Response> }>(`src/app/api/${route}/route.ts`, {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } }, '@prisma/client': {},
            '@/lib/auth': { auth: async () => ({ user: { id: 'synthetic', passwordChangedAt: 0 } }) },
            '@/lib/auth-utils': { getDbAuthenticatedUser: async () => null },
            '@/lib/mobile-auth': { getMobileUserFromRequest: () => { bearerCalls++; return { id: 'other' } } },
            '@/lib/prisma': { default: new Proxy({}, { get: () => { reads++; throw new Error('DOMAIN_ACCESS') } }) },
            '@/lib/notification': {}, '@/lib/panel-list-query': { panelListQuery },
        })
        assert.equal((await api.GET(new Request('https://panel.test/api/' + route))).status, 401)
        assert.equal(reads, 0)
        assert.equal(bearerCalls, 0)
    })
}

test('new panel messages have identical nonempty keys in all supported languages', () => {
    function messageKeys(messages: Record<string, unknown>, prefix = ''): string[] {
        return Object.entries(messages).flatMap(([key, value]) => {
            const path = prefix + key
            if (typeof value === 'string') {
                assert.ok(value.trim(), path + ' must not be empty')
                return [path]
            }
            assert.ok(value && typeof value === 'object', path + ' must contain messages')
            return messageKeys(value as Record<string, unknown>, path + '.')
        }).sort()
    }
    assert.deepEqual(messageKeys(ar.panelUi), messageKeys(en.panelUi))
    assert.deepEqual(messageKeys(bn.panelUi), messageKeys(en.panelUi))
    assert.deepEqual(Object.keys(ar.panelTable).sort(), Object.keys(en.panelTable).sort())
    assert.deepEqual(Object.keys(bn.panelTable).sort(), Object.keys(en.panelTable).sort())
    for (const locale of [ar, en, bn]) {
        for (const value of Object.values(locale.panelTable)) assert.ok(value.trim())
        assert.equal(locale.contracts.validUntil.match(/\{date\}/g)?.length, 1)
    }
})

for (const mode of ['valid', 'revoked', 'unavailable', 'anonymous']) {
    test(`server login entry handles ${mode} without redirect loops`, async () => {
        const page = loadIsolatedModule<{ default(): Promise<{ props: { revoked?: boolean; unavailable?: boolean } }> }>('src/app/login/page.tsx', {
            '@/lib/auth': { auth: async () => mode === 'anonymous' ? null : { user: { id: 'synthetic' } } },
            '@/lib/auth-utils': { getDbAuthenticatedUser: async () => {
                if (mode === 'unavailable') throw new Error('SYNTHETIC_DB_DOWN')
                return mode === 'valid' ? { id: 'synthetic' } : null
            } },
            'next/navigation': { redirect: (url: string) => { throw new Error('REDIRECT:' + url) } },
            '@/components/auth/LoginPageClient': { default: 'client' },
            'react/jsx-runtime': { jsx: (type: unknown, props: unknown) => ({ type, props }) },
        })
        if (mode === 'valid') await assert.rejects(page.default(), /REDIRECT:\/dashboard/)
        else {
            const result = await page.default()
            assert.equal(Boolean(result.props.revoked), mode === 'revoked')
            assert.equal(Boolean(result.props.unavailable), mode === 'unavailable')
        }
    })
}

test('manager user filtering excludes deleted users before pagination and count', async () => {
    const file = 'src/app/api/manager/users/route.ts'
    const dependencies = Object.fromEntries(ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    const queries: { where: { managerId: string; user: { deletedAt: null; OR: unknown[] } }; skip?: number }[] = []
    Object.assign(dependencies, {
        'next/server': { NextResponse: { json: Response.json.bind(Response) } }, zod: { z },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => ({ user: { id: 'manager', role: 'MANAGER' } }) },
        '@/lib/rate-limiter': { withRateLimit: async () => ({ allowed: true }), RATE_LIMITS: {} },
        '@/lib/permissions/guards': { evaluatePermissionForAuthenticatedUser: async () => ({ allowed: false }) },
        '@/lib/permissions/catalog': { PERMISSION_KEYS: {} },
        '@/lib/points/balance': { groupPointSummariesByOwner: () => new Map() },
        '@/lib/prisma': { default: { managerUser: {
            findMany: async (query: typeof queries[number]) => { queries.push(query); return [] },
            count: async (query: typeof queries[number]) => { queries.push(query); return 0 },
        } } },
    })
    const api = loadIsolatedModule<{ GET(request: Request): Promise<Response> }>(file, dependencies)
    assert.equal((await api.GET(new Request('https://panel.test/api/manager/users?page=2&search=name%2Btag'))).status, 200)
    assert.equal(queries[0].skip, 10)
    assert.equal(queries[0].where.managerId, 'manager')
    assert.equal(queries[0].where.user.deletedAt, null)
    assert.deepEqual(queries[0].where, queries[1].where)
    assert.ok(JSON.stringify(queries[0].where).includes('name+tag'))
})

for (const web of [true, false]) {
    test(`transaction query preserves owner scope and ${web ? 'web sorting' : 'existing bearer ordering'}`, async () => {
        const queries: { orderBy: unknown; where: { userId: string }; skip: number }[] = []
        const api = loadIsolatedModule<{ GET(request: Request): Promise<Response> }>('src/app/api/transactions/route.ts', {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } }, '@prisma/client': {},
            '@/lib/auth': { auth: async () => web ? { user: { id: 'owner' } } : null },
            '@/lib/auth-utils': { getDbAuthenticatedUser: async () => ({ id: 'owner' }) },
            '@/lib/mobile-auth': { getMobileUserFromRequest: () => ({ id: 'owner' }) },
            '@/lib/panel-list-query': { panelListQuery },
            '@/lib/prisma': { default: {
                transaction: { findMany: async (query: typeof queries[number]) => { queries.push(query); return [] },
                    count: async () => 11, aggregate: async () => ({ _sum: { amount: 0 } }) },
                user: { findUnique: async () => ({ balance: 0 }) },
            } },
        })
        const response = await api.GET(new Request('https://panel.test/api/transactions?page=2&sortBy=amount&sortOrder=asc'))
        assert.equal(response.status, 200)
        assert.equal(queries[0].where.userId, 'owner')
        assert.equal(queries[0].skip, 10)
        assert.equal(JSON.stringify(queries[0].orderBy), JSON.stringify(web ? [{ amount: 'asc' }, { id: 'asc' }] : { createdAt: 'desc' }))
        assert.equal((await response.json()).total, 11)
    })
}
