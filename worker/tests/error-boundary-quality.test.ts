import test from 'node:test'
import assert from 'node:assert/strict'
import { HttpClientService } from '../src/http/HttpClientService'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'

test('a non-Error transport rejection cannot escape the HTTP failure boundary', async () => {
    const client = { config: { checkUrl: 'https://synthetic.invalid/check' },
        axios: { get: async () => { throw null } }, buildFullUrl: (url: string) => url }
    const result = await HttpClientService.prototype.checkCardForSignal.call(client as unknown as HttpClientService, '999999999999')
    assert.equal(result.success, false)
    assert.ok(result.error)
})
test('cache failures remain nonfatal even when a dependency rejects without an Error', async () => {
    const cache = loadIsolatedModule<{ getCachedSTB: (card: string) => Promise<string | null> }>(
        'worker/src/lib/package-cache.ts', { './redis': { getRedisConnection: () => ({ get: async () => { throw null } }) } })
    assert.equal(await cache.getCachedSTB('999999999999'), null)
})
test('retry preserves the original rejection and reaches its configured attempt bound', async () => {
    const api = loadIsolatedModule<{ withRetry: (work: () => Promise<unknown>, options: { maxRetries: number }) => Promise<unknown> }>(
        'worker/src/utils/retry-strategy.ts', {})
    let attempts = 0
    await assert.rejects(api.withRetry(async () => { attempts++; throw null }, { maxRetries: 3 }), error => error === null)
    assert.equal(attempts, 3)
})
