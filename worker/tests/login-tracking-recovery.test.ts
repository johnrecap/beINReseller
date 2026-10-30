import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as failures from '../../shared/bein/login-failure'

function fixture() {
    const writes: unknown[] = []
    const api = loadIsolatedModule<any>('worker/src/lib/bein-login-tracking.ts', {
        './prisma': { prisma: {
            setting: { findUnique: async () => ({ value: '3' }) },
            beinAccount: { update: async (input: unknown) => { writes.push(input); return { consecutiveLoginFailures: 3 } } },
            $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { writes.push({ sql: strings.join('?'), values }); return 1 },
        } },
        '../../../shared/bein/login-failure': failures,
    })
    return { ...api, writes }
}

test('transport and unknown errors never reach credential counter SQL', async () => {
    const api = fixture()
    for (const reason of ['Login failed - redirected to error page', 'Login connection failed (HTTP 402)', 'Login failed after CAPTCHA']) {
        assert.equal(api.shouldCountAsCredentialFailure(reason), false)
        await api.recordLoginFailure('a', reason, new Date('2026-10-30T00:00:00Z'))
    }
    assert.deepEqual(api.writes, [])
})

test('credential rejection uses one conditional atomic increment/disable and revision fence', async () => {
    const api = fixture()
    const revision = new Date('2026-10-30T00:00:00Z')
    await api.recordLoginFailure('a', 'Invalid username or password', revision)
    assert.equal(api.writes.length, 1)
    assert.match(api.writes[0].sql, /UPDATE "bein_accounts"/)
    assert.match(api.writes[0].sql, /"is_active"\s*=\s*CASE/)
    assert.match(api.writes[0].sql, /WHERE.*"updated_at"/s)
    assert.ok(api.writes[0].values.includes(revision))
})
