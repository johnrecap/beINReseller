import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as accountLocks from '../../src/lib/operations/account-lock-release'

function accountApi(path: string, isAdmin = true, redisUnavailable = false) {
    const account = { id: 'synthetic-account', username: 'synthetic', label: 'Synthetic', isActive: true,
        automationExclusive: true, cooldownUntil: new Date('2099-01-01'), totalSuccess: 1, totalFailures: 0,
        _count: { operations: 1 }, sessions: [], operations: [] }
    let cooldownReads = 0
    let databaseReads = 0
    let redisReads = 0
    class Redis {
        async get() { redisReads++; if (redisUnavailable) throw new Error('SYNTHETIC_REDIS_UNAVAILABLE'); return null }
        async ttl(key: string) { if (key.includes('cooldown')) { cooldownReads++; return 600 }; return -2 }
        async zcount() { redisReads++; return 0 }
        async quit() { return undefined }
    }
    const api = loadIsolatedModule<{ GET: (request: unknown, context?: unknown) => Promise<Response> }>(path, {
        'next/server': { NextResponse: { json: Response.json.bind(Response) } },
        '@/lib/prisma': { prisma: { beinAccount: {
            findMany: async () => { databaseReads++; return [account] },
            findUnique: async () => { databaseReads++; return account },
        } } },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => isAdmin ? { user: { id: 'admin' } }
            : { error: 'Forbidden', status: 403 } },
        '@/lib/crypto': {}, ioredis: { default: Redis },
        '@/lib/operations/account-lock-release': accountLocks,
        '@/lib/provider-account-identity': {},
    })
    return { api, reads: () => ({ cooldownReads, databaseReads, redisReads }) }
}

for (const redisUnavailable of [false, true]) {
    test(`admin account list ignores historical cooldowns (Redis unavailable=${redisUnavailable})`, async () => {
        const h = accountApi('src/app/api/admin/bein-accounts/route.ts', true, redisUnavailable)
        const response = await h.api.GET({ nextUrl: new URL('http://localhost/api/admin/bein-accounts') })
        assert.equal(response.status, 200)
        const result = await response.json()
        assert.equal(result.accounts[0].cooldownUntil, null)
        assert.equal(result.poolStatus.inCooldown, 0)
        assert.equal(result.poolStatus.availableNow, 1)
        assert.equal(h.reads().cooldownReads, 0)
        assert.ok(h.reads().redisReads > 0)
    })
}

test('admin account detail reports no effective cooldown with old DB and Redis values', async () => {
    const h = accountApi('src/app/api/admin/bein-accounts/[id]/route.ts')
    const response = await h.api.GET({}, { params: Promise.resolve({ id: 'synthetic-account' }) })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.account.cooldownUntil, null)
    assert.equal(result.account.cooldownRemaining, 0)
    assert.equal(h.reads().cooldownReads, 0)
    assert.ok(h.reads().redisReads > 0)
})

test('account cooldown removal retains admin authorization on list and detail', async () => {
    for (const path of ['src/app/api/admin/bein-accounts/route.ts', 'src/app/api/admin/bein-accounts/[id]/route.ts']) {
        const h = accountApi(path, false)
        assert.equal((await h.api.GET({}, { params: Promise.resolve({ id: 'synthetic-account' }) })).status, 403)
        assert.equal(h.reads().databaseReads, 0)
    }
})

test('retired account cooldown settings cannot be edited or seeded again', () => {
    for (const path of ['src/components/admin/BeINConfigForm.tsx', 'src/app/api/admin/bein-config/route.ts',
        'src/app/api/admin/seed-pool-settings/route.ts', 'scripts/seed-pool-settings.ts']) {
        assert.doesNotMatch(readFileSync(path, 'utf8'), /pool_cooldown_(?:after_failures|duration_seconds)/, path)
    }
    assert.doesNotMatch(readFileSync('src/app/dashboard/admin/bein-accounts/page.tsx', 'utf8'), /account\.cooldownUntil/)
})
