import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    ACCOUNT_EXECUTION_LEASE_TTL_SECONDS,
    acquireAccountExecutionLease,
    assertAccountExecutionLease,
    buildAccountLockOwnerValue,
    canAcquireAccountLock,
    canReleaseAccountLock,
    getAccountExecutionLeaseStatus,
    releaseAccountExecutionLease,
    renewAccountExecutionLease,
    transitionAccountLockToExecutionLease,
} from '../src/pool/account-locking'

test('2026-08-24 regression: legacy account lock needs the exact structured worker and operation owner', () => {
    const owner = buildAccountLockOwnerValue({
        workerId: 'worker-a',
        operationId: 'operation-1',
        acquiredAt: new Date('2026-08-24T00:00:00.000Z'),
    })

    assert.equal(canAcquireAccountLock(owner, 'worker-a', 'operation-1').allowed, true)
    assert.equal(canReleaseAccountLock(owner, 'worker-a', 'operation-1').allowed, true)
    assert.equal(canAcquireAccountLock(owner, 'worker-b', 'operation-1').allowed, false)
    assert.equal(canReleaseAccountLock(owner, 'worker-b', 'operation-1').allowed, false)
    assert.equal(canReleaseAccountLock(owner, 'worker-a', 'operation-2').allowed, false)
})

test('legacy-to-execution lease transition is one atomic exact-owner operation', () => {
    const source = readFileSync(
        join(process.cwd(), 'worker/src/http-queue-processor.ts'),
        'utf8'
    )
    const start = source.indexOf('async function reserveProviderAccountForFulfillment(')
    const end = source.indexOf('function startExecutionLeaseHeartbeat(', start)
    assert.ok(start >= 0 && end > start)
    const transition = source.slice(start, end)

    assert.match(transition, /ownerWorkerId !== input\.accountPool\.getWorkerId\(\)/)
    assert.match(transition, /transitionAccountLockToExecutionLease/)
    assert.match(transition, /expectedLegacyOwner: legacyLockStatus\.rawOwner/)
    assert.doesNotMatch(transition, /releaseLock\(\s*input\.beinAccountId/)
})

const runRedisIntegration =
    process.env.RUN_REDIS_INTEGRATION === '1' ||
    process.env.RUN_REDIS_INTEGRATION === 'true'

async function deleteOnlyTestKeys(redis: import('ioredis').default, marker: string): Promise<void> {
    let cursor = '0'
    do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `*${marker}*`, 'COUNT', 100)
        cursor = nextCursor
        if (keys.length > 0) await redis.del(...keys)
    } while (cursor !== '0')
}

test('T028 Redis lease has one atomic winner and exact-owner renew/assert/release', { skip: !runRedisIntegration }, async () => {
    assert.ok(process.env.TEST_REDIS_URL, 'TEST_REDIS_URL is required when RUN_REDIS_INTEGRATION is enabled')
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(process.env.TEST_REDIS_URL!, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
    })
    const marker = `t028-lease-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const accountId = `account-${marker}`

    try {
        await redis.connect()
        const contenders = await Promise.all([
            acquireAccountExecutionLease(redis, {
                accountId,
                operationId: 'operation-1',
                reservationGeneration: 9,
                leaseId: 'invocation-a',
                workerId: 'worker-a',
            }),
            acquireAccountExecutionLease(redis, {
                accountId,
                operationId: 'operation-1',
                reservationGeneration: 9,
                leaseId: 'invocation-b',
                workerId: 'worker-a',
            }),
        ])
        const winners = contenders.filter((handle) => handle !== null)
        assert.equal(winners.length, 1)
        const winner = winners[0]!

        assert.equal(await assertAccountExecutionLease(redis, winner), true)
        assert.equal(await renewAccountExecutionLease(redis, winner), true)
        const active = await getAccountExecutionLeaseStatus(redis, accountId)
        assert.equal(active.active, true)
        assert.ok(active.ttlSeconds > ACCOUNT_EXECUTION_LEASE_TTL_SECONDS - 5)
        assert.ok(active.ttlSeconds <= ACCOUNT_EXECUTION_LEASE_TTL_SECONDS)

        const copiedBySameOperation = {
            ...winner,
            leaseId: `${winner.leaseId}-copied`,
        }
        assert.equal(await assertAccountExecutionLease(redis, copiedBySameOperation), false)
        assert.equal(await renewAccountExecutionLease(redis, copiedBySameOperation), false)
        assert.equal(await releaseAccountExecutionLease(redis, copiedBySameOperation), false)

        assert.equal(await releaseAccountExecutionLease(redis, winner), true)
        assert.equal(await assertAccountExecutionLease(redis, winner), false)

        const next = await acquireAccountExecutionLease(redis, {
            accountId,
            operationId: 'operation-1',
            reservationGeneration: 9,
            leaseId: 'invocation-next-job',
            workerId: 'worker-b',
        })
        assert.ok(next)
        assert.ok(next.fencingToken > winner.fencingToken)
        assert.equal(await assertAccountExecutionLease(redis, winner), false)
        assert.equal(await releaseAccountExecutionLease(redis, winner), false)
        assert.equal(await releaseAccountExecutionLease(redis, next), true)
    } finally {
        await deleteOnlyTestKeys(redis, marker).catch(() => undefined)
        await redis.quit().catch(() => undefined)
    }
})

test('T028 exact legacy owner has one atomic transition winner', { skip: !runRedisIntegration }, async () => {
    assert.ok(process.env.TEST_REDIS_URL, 'TEST_REDIS_URL is required when RUN_REDIS_INTEGRATION is enabled')
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(process.env.TEST_REDIS_URL!, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
    })
    const marker = `t028-transition-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const accountId = `account-${marker}`
    const expectedLegacyOwner = buildAccountLockOwnerValue({
        workerId: 'worker-a',
        operationId: 'operation-1',
        acquiredAt: new Date(),
    })

    try {
        await redis.connect()
        await redis.set(`bein:account:lock:${accountId}`, expectedLegacyOwner, 'EX', 30)
        const contenders = await Promise.all([
            transitionAccountLockToExecutionLease(redis, {
                accountId,
                operationId: 'operation-1',
                reservationGeneration: 11,
                leaseId: 'transition-a',
                workerId: 'worker-a',
                expectedLegacyOwner,
            }),
            transitionAccountLockToExecutionLease(redis, {
                accountId,
                operationId: 'operation-1',
                reservationGeneration: 11,
                leaseId: 'transition-b',
                workerId: 'worker-a',
                expectedLegacyOwner,
            }),
        ])
        const winners = contenders.filter((handle) => handle !== null)
        assert.equal(winners.length, 1)
        assert.equal(await redis.get(`bein:account:lock:${accountId}`), null)
        assert.equal(await assertAccountExecutionLease(redis, winners[0]!), true)
        assert.equal(await releaseAccountExecutionLease(redis, winners[0]!), true)
    } finally {
        await deleteOnlyTestKeys(redis, marker).catch(() => undefined)
        await redis.quit().catch(() => undefined)
    }
})

test('T028 expired execution lease cannot interfere with a delayed verification job', { skip: !runRedisIntegration }, async () => {
    assert.ok(process.env.TEST_REDIS_URL, 'TEST_REDIS_URL is required when RUN_REDIS_INTEGRATION is enabled')
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(process.env.TEST_REDIS_URL!, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
    })
    const marker = `t028-expiry-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const accountId = `account-${marker}`

    try {
        await redis.connect()
        const expired = await acquireAccountExecutionLease(redis, {
            accountId,
            operationId: 'operation-1',
            reservationGeneration: 3,
            leaseId: 'verification-attempt-1',
            workerId: 'worker-a',
            ttlSeconds: 1,
        })
        assert.ok(expired)

        await new Promise((resolve) => setTimeout(resolve, 1_100))

        const delayedJob = await acquireAccountExecutionLease(redis, {
            accountId,
            operationId: 'operation-1',
            reservationGeneration: 3,
            leaseId: 'verification-attempt-2',
            workerId: 'worker-b',
        })
        assert.ok(delayedJob)
        assert.ok(delayedJob.fencingToken > expired.fencingToken)
        assert.equal(await assertAccountExecutionLease(redis, expired), false)
        assert.equal(await renewAccountExecutionLease(redis, expired), false)
        assert.equal(await releaseAccountExecutionLease(redis, expired), false)
        assert.equal(await releaseAccountExecutionLease(redis, delayedJob), true)
    } finally {
        await deleteOnlyTestKeys(redis, marker).catch(() => undefined)
        await redis.quit().catch(() => undefined)
    }
})
