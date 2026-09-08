import test from 'node:test'
import assert from 'node:assert/strict'
import {
    acquireAccountExecutionLease,
    buildAccountExecutionLeaseOwnerValue,
    releaseAccountExecutionLease,
    type AccountExecutionLeaseHandle,
} from '../src/pool/account-locking'
import {
    buildSessionCacheKey,
    saveSessionToCacheFenced,
} from '../src/lib/session-cache'

const runRedisIntegration =
    process.env.RUN_REDIS_INTEGRATION === '1' ||
    process.env.RUN_REDIS_INTEGRATION === 'true'

class LeaseCasRedisBoundary {
    private currentLeaseOwner: string | null = null
    private cacheValue: string | null = null

    setLease(handle: AccountExecutionLeaseHandle): void {
        this.currentLeaseOwner = buildAccountExecutionLeaseOwnerValue(handle)
    }

    async eval(_script: string, _keyCount: number, ...args: Array<string | number>): Promise<number> {
        const expectedOwner = String(args[2])
        const payload = String(args[3])
        if (this.currentLeaseOwner !== expectedOwner) return 0
        this.cacheValue = payload
        return 1
    }

    readCachedPayload(): string | null {
        return this.cacheValue
    }
}

function handle(overrides: Partial<AccountExecutionLeaseHandle> = {}): AccountExecutionLeaseHandle {
    return {
        accountId: 'account-1',
        operationId: 'operation-1',
        reservationGeneration: 2,
        leaseId: 'invocation-1',
        fencingToken: 5,
        workerId: 'worker-a',
        acquiredAt: '2026-08-24T18:40:00.000Z',
        ...overrides,
    }
}

test('T028 fenced session cache rejects a stale writer without replacing fresh state', async () => {
    const boundary = new LeaseCasRedisBoundary()
    const stale = handle()
    const current = handle({ leaseId: 'invocation-2', fencingToken: 6, workerId: 'worker-b' })
    boundary.setLease(current)
    const freshSession = {
        cookies: 'fresh-cookie',
        accountId: current.accountId,
        loginTimestamp: Date.now(),
        expiresAt: Date.now() + 60_000,
    }

    assert.equal(await saveSessionToCacheFenced(boundary, {
        accountId: current.accountId,
        routeKey: 'direct',
        session: freshSession,
        ttlSeconds: 60,
        lease: current,
    }), true)
    const payloadAfterFreshWrite = boundary.readCachedPayload()
    assert.match(payloadAfterFreshWrite ?? '', /fresh-cookie/)

    assert.equal(await saveSessionToCacheFenced(boundary, {
        accountId: stale.accountId,
        routeKey: 'direct',
        session: { ...freshSession, cookies: 'stale-cookie' },
        ttlSeconds: 60,
        lease: stale,
    }), false)
    assert.equal(boundary.readCachedPayload(), payloadAfterFreshWrite)
    assert.doesNotMatch(boundary.readCachedPayload() ?? '', /stale-cookie/)
})

test('T028 Redis session CAS remains fenced after lease handoff', { skip: !runRedisIntegration }, async () => {
    assert.ok(process.env.TEST_REDIS_URL, 'TEST_REDIS_URL is required when RUN_REDIS_INTEGRATION is enabled')
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(process.env.TEST_REDIS_URL!, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
    })
    const marker = `t028-session-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const accountId = `account-${marker}`
    const routeKey = 'direct'

    try {
        await redis.connect()
        const first = await acquireAccountExecutionLease(redis, {
            accountId,
            operationId: 'operation-1',
            reservationGeneration: 4,
            leaseId: 'attempt-1',
            workerId: 'worker-a',
        })
        assert.ok(first)
        assert.equal(await releaseAccountExecutionLease(redis, first), true)

        const second = await acquireAccountExecutionLease(redis, {
            accountId,
            operationId: 'operation-1',
            reservationGeneration: 4,
            leaseId: 'attempt-2',
            workerId: 'worker-b',
        })
        assert.ok(second)
        const baseSession = {
            accountId,
            loginTimestamp: Date.now(),
            expiresAt: Date.now() + 60_000,
        }
        assert.equal(await saveSessionToCacheFenced(redis, {
            accountId,
            routeKey,
            session: { ...baseSession, cookies: 'fresh-cookie' },
            ttlSeconds: 60,
            lease: second,
        }), true)
        assert.equal(await saveSessionToCacheFenced(redis, {
            accountId,
            routeKey,
            session: { ...baseSession, cookies: 'stale-cookie' },
            ttlSeconds: 60,
            lease: first,
        }), false)

        const payload = await redis.get(buildSessionCacheKey(accountId, routeKey))
        assert.match(payload ?? '', /fresh-cookie/)
        assert.doesNotMatch(payload ?? '', /stale-cookie/)
        assert.equal(await releaseAccountExecutionLease(redis, second), true)
    } finally {
        try {
            let cursor = '0'
            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `*${marker}*`, 'COUNT', 100)
                cursor = nextCursor
                if (keys.length > 0) await redis.del(...keys)
            } while (cursor !== '0')
        } catch {
            // The explicit integration gate may point at an unavailable disposable Redis.
        }
        await redis.quit().catch(() => undefined)
    }
})
