import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as failures from '../../shared/bein/login-failure'
import * as health from '../../shared/bein/login-health'

function fixture(options: { changed?: number; fail?: boolean } = {}) {
    const writes: unknown[] = []
    const api = loadIsolatedModule<any>('worker/src/lib/bein-login-tracking.ts', {
        './prisma': { prisma: {
            setting: { findUnique: async () => ({ value: '3' }) },
            beinAccount: { update: async (input: unknown) => { writes.push(input); return { consecutiveLoginFailures: 3 } } },
            $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
                writes.push({ sql: strings.join('?'), values });
                if (options.fail) throw new Error('synthetic private database detail');
                return options.changed ?? 1
            },
            $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
                writes.push({ sql: strings.join('?'), values });
                if (options.fail) throw new Error('synthetic private database detail');
                return options.changed === 0 ? [] : [{ updatedAt: new Date('2026-11-04T00:01:00Z') }]
            },
        } },
        '../../../shared/bein/login-failure': failures,
        '../../../shared/bein/login-health': health,
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
    assert.ok(api.writes[0].values.includes(true), 'legacy credential callers must disable on the first terminal rejection, regardless of stored threshold 3')
})

test('037 terminal health write quarantines without a configurable threshold and fences old results', async () => {
    const api = fixture()
    const revision = new Date('2026-11-04T00:00:00Z')
    await api.recordLoginHealthFailure('a', failures.loginMessageFailure('CAPTCHA'), revision, { attempted: true, terminal: true, captchaSubmissions: 3 })
    assert.equal(api.writes.length, 1)
    assert.ok(api.writes[0].values.includes('LOGIN_HEALTH_V1:CAPTCHA_EXHAUSTED'))
    assert.ok(api.writes[0].values.includes(true))
    assert.ok(api.writes[0].values.includes(0), 'CAPTCHA never increments the credential counter')
    assert.ok(api.writes[0].values.includes(revision))
    assert.match(api.writes[0].sql, /WHERE.*"updated_at".*"is_active" = true/s)
})

test('037 transport health warning preserves activity and missing revision fails closed', async () => {
    const api = fixture()
    await api.recordLoginHealthFailure('a', failures.loginHttpFailure(402), new Date(), { attempted: true, terminal: true })
    assert.ok(api.writes[0].values.includes('LOGIN_HEALTH_V1:CONNECTION_FAILED'))
    assert.ok(api.writes[0].values.includes(false))
    await assert.rejects(api.recordLoginHealthFailure('a', failures.loginMessageFailure(), undefined,
        { attempted: false, terminal: true }), /LOGIN_HEALTH_REVISION_REQUIRED/)
})

test('037 persistence errors are safe and stale results never retry against the recovered revision', async () => {
    const input = failures.loginMessageFailure('Invalid username or password')
    const context = { attempted: true, terminal: true }
    const stale = fixture({ changed: 0 })
    assert.equal(await stale.recordLoginHealthFailure('a', input, new Date(), context), false)
    assert.equal(stale.writes.length, 1)
    const failed = fixture({ fail: true })
    await assert.rejects(failed.recordLoginHealthFailure('a', input, new Date(), context),
        { message: 'LOGIN_HEALTH_PERSIST_FAILED' })
    assert.equal(failed.writes.length, 1)
})

test('037 healthy login returns only its own revision and fails closed on stale or unavailable persistence', async () => {
    const api = fixture()
    assert.equal((await api.recordLoginHealthSuccess('a', new Date())).toISOString(), '2026-11-04T00:01:00.000Z')
    assert.match(api.writes[0].sql, /RETURNING.*updated_at/s)
    await assert.rejects(fixture({ changed: 0 }).recordLoginHealthSuccess('a', new Date()), /LOGIN_HEALTH_STALE/)
    await assert.rejects(fixture({ fail: true }).recordLoginHealthSuccess('a', new Date()), /LOGIN_HEALTH_PERSIST_FAILED/)
    await assert.rejects(api.recordLoginHealthSuccess('a', undefined), /LOGIN_HEALTH_REVISION_REQUIRED/)
})
