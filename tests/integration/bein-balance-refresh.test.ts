import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'
import { admitBalanceRefresh, claimBalanceRefresh, finishBalanceRefresh, readBalanceRefresh,
    activeBalanceRefresh, balanceRefreshKey, balanceActiveKey } from '../../shared/bein/balance-refresh-store'

const url = process.env.BALANCE_REFRESH_TEST_REDIS_URL
if (url && (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname) || new URL(url).pathname !== '/15'))
    throw new Error('Balance refresh tests require explicit loopback Redis database 15')

test('native Redis: one admission, one run owner, terminal fencing, failure and expiry', { skip: !url }, async () => {
    const redis = new Redis(url!, { maxRetriesPerRequest: 1, retryStrategy: () => null })
    const account = `qa-balance-${randomUUID()}`, ids = Array.from({ length: 12 }, () => randomUUID())
    const now = Date.now()
    try {
        const entries = await Promise.all(ids.map(id => admitBalanceRefresh(redis, account, id, now)))
        assert.equal(entries.filter(e => e.created).length, 1)
        assert.equal(new Set(entries.map(e => e.request.requestId)).size, 1)
        const request = entries[0].request
        assert.equal((await activeBalanceRefresh(redis, account, now))?.requestId, request.requestId)
        const claims = await Promise.all(['one', 'two'].map(token => claimBalanceRefresh(redis, request.requestId, token, now + 1)))
        assert.equal(claims.filter(Boolean).length, 1)
        const running = claims.find(Boolean)!
        assert.equal(running.deadline, now + 60_001)
        const result = { balance: 12.5, updatedAt: new Date(now).toISOString() }
        assert.equal(await finishBalanceRefresh(redis, running.requestId, 'wrong', { state: 'COMPLETED', ...result }, now + 2), false)
        assert.equal(await finishBalanceRefresh(redis, running.requestId, running.runToken!, { state: 'COMPLETED', ...result }, now + 2), true)
        assert.equal(await finishBalanceRefresh(redis, running.requestId, running.runToken!, { state: 'FAILED', errorCode: 'BALANCE_FAILED' }, now + 3), false)
        assert.equal((await readBalanceRefresh(redis, request.requestId, now + 4))?.balance, 12.5)
        assert.equal(await activeBalanceRefresh(redis, account, now + 4), null)
        const next = await admitBalanceRefresh(redis, account, ids.find(id => id !== request.requestId)!, now + 5)
        assert.equal(next.created, true)
        assert.equal((await readBalanceRefresh(redis, next.request.requestId, now + 300_006))?.errorCode, 'BALANCE_TIMEOUT')
        assert.equal(await claimBalanceRefresh(redis, next.request.requestId, 'late', now + 300_007), null)
        assert.equal(await activeBalanceRefresh(redis, account, now + 300_007), null)
        const used = new Set([request.requestId, next.request.requestId])
        const failedId = ids.find(id => !used.has(id))!; used.add(failedId)
        await admitBalanceRefresh(redis, account, failedId, now + 300_010)
        await claimBalanceRefresh(redis, failedId, 'failed-owner', now + 300_011)
        assert.equal(await finishBalanceRefresh(redis, failedId, 'failed-owner', { state: 'FAILED', errorCode: 'CONNECTION_FAILED' }, now + 300_012), true)
        assert.equal((await readBalanceRefresh(redis, failedId, now + 300_013))?.errorCode, 'CONNECTION_FAILED')
        assert.ok((await redis.ttl(balanceRefreshKey(failedId))) <= 300)
        assert.ok((await redis.ttl(balanceRefreshKey(failedId))) > 295)
        const expiredId = ids.find(id => !used.has(id))!
        await admitBalanceRefresh(redis, account, expiredId, now + 300_014)
        await claimBalanceRefresh(redis, expiredId, 'expired-owner', now + 300_015)
        assert.equal(await finishBalanceRefresh(redis, expiredId, 'expired-owner', { state: 'COMPLETED', ...result }, now + 360_016), true)
        const expired = await readBalanceRefresh(redis, expiredId, now + 360_017)
        assert.equal(expired?.state, 'FAILED')
        assert.equal(expired?.errorCode, 'BALANCE_TIMEOUT')
        assert.equal(expired?.balance, undefined)
        assert.equal(await activeBalanceRefresh(redis, account, now + 360_017), null)
    } finally {
        await redis.del(balanceActiveKey(account), ...ids.map(balanceRefreshKey))
        await redis.quit()
    }
})
