import test from 'node:test'
import assert from 'node:assert/strict'
import {
    getAccountLockKey,
    releaseAccountLockSafely,
} from '@/lib/operations/account-lock-release'

function createRedisMock(initial: Record<string, string>) {
    const store = new Map(Object.entries(initial))
    return {
        store,
        client: {
            async get(key: string) {
                return store.get(key) ?? null
            },
            async eval(_script: string, _keyCount: number, key: string, owner: string) {
                if (store.get(key) === owner) {
                    store.delete(key)
                    return 1
                }
                return 0
            },
        },
    }
}

test('preserves foreign-owned account lock during recovery release', async () => {
    const accountId = 'bein-account-1'
    const key = getAccountLockKey(accountId)
    const redis = createRedisMock({ [key]: 'worker-live' })

    const result = await releaseAccountLockSafely(redis.client, accountId, 'recovery-owner')

    assert.equal(result.released, false)
    assert.equal(result.reason, 'owner_mismatch')
    assert.equal(redis.store.get(key), 'worker-live')
})
test('releases account lock when expected owner matches current owner', async () => {
    const accountId = 'bein-account-2'
    const key = getAccountLockKey(accountId)
    const redis = createRedisMock({ [key]: 'recovery-owner' })

    const result = await releaseAccountLockSafely(redis.client, accountId, 'recovery-owner')

    assert.equal(result.released, true)
    assert.equal(result.reason, 'owner_matched')
    assert.equal(redis.store.has(key), false)
})

test('skips account lock release when owner evidence is unavailable', async () => {
    const accountId = 'bein-account-3'
    const key = getAccountLockKey(accountId)
    const redis = createRedisMock({ [key]: 'worker-live' })

    const result = await releaseAccountLockSafely(redis.client, accountId, null)

    assert.equal(result.released, false)
    assert.equal(result.reason, 'missing_expected_owner')
    assert.equal(redis.store.get(key), 'worker-live')
})
