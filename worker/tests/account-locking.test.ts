import test from 'node:test'
import assert from 'node:assert/strict'
import * as locking from '../src/pool/account-locking'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { OperationStatus } from '@prisma/client'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'

test('prepared owner is explicit and cannot reacquire the legacy lock', () => {
    const raw = JSON.stringify({ workerId: 'worker-a', operationId: 'operation-1',
        acquiredAt: new Date().toISOString(), handoffReady: true })
    const status = locking.getAccountLockStatusFromOwner(raw)
    assert.equal(status.handoffReady, true)
    assert.equal(locking.canAcquireAccountLock(raw, 'worker-a', 'operation-1').allowed, false)
    assert.equal(locking.canAcquireAccountLock(raw, 'worker-b', 'operation-1').allowed, false)
    assert.equal(locking.getAccountLockStatusFromOwner(JSON.stringify({
        workerId: 'worker-a', operationId: 'operation-1', handoffReady: 'true',
    })).handoffReady, false)
})

test('actual reservation orchestrator transfers a parked legacy owner to another worker using real Redis', {
    skip: process.env.RUN_REDIS_INTEGRATION !== '1',
}, async () => {
    const url = new URL(process.env.TEST_REDIS_URL!)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(url.href, { maxRetriesPerRequest: 1, lazyConnect: true })
    const accountId = `review-handoff-${randomUUID()}`
    const key = `bein:account:lock:${accountId}`
    const path = 'worker/src/http-queue-processor.ts'
    const deps: Record<string, unknown> = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8'))
        .importedFiles.map(f => [f.fileName, {}]))
    Object.assign(deps, {
        'node:crypto': { randomUUID }, '@prisma/client': { OperationStatus },
        './pool/account-locking': locking,
        './lib/crypto': { decryptAccountPassword: (account: unknown) => account },
        './lib/prisma': { prisma: {
            beinAccount: { findUnique: async () => ({ id: accountId, isActive: true, automationExclusive: true }) },
            $transaction: async (run: (tx: unknown) => unknown) => run({}),
        } },
        './lib/provider-account-reservation': {
            acquireProviderAccountCausalReservation: async (_tx: unknown, input: { operationId: string }) => ({
                status: 'ALREADY_HELD', reservation: { operationId: input.operationId, reservationGeneration: 1 },
            }),
            assertActiveProviderAccountReservation: async () => true,
            decideProviderAccountConsumerAccess: () => ({ allowed: true }),
        },
    })
    const api = loadIsolatedModule<{ reserveProviderAccountForFulfillment(input: unknown):
        Promise<{ lease: locking.AccountExecutionLeaseHandle } | null> }>(path, deps, ['reserveProviderAccountForFulfillment'])
    const pool = { getRedis: () => redis, getWorkerId: () => 'worker-b',
        releaseExecutionLease: (lease: locking.AccountExecutionLeaseHandle) => locking.releaseAccountExecutionLease(redis, lease) }
    try {
        await redis.connect()
        await redis.set(key, locking.buildAccountLockOwnerValue({ workerId: 'worker-a', operationId: 'operation-1' }), 'EX', 30)
        const request = { operationId: 'operation-1', beinAccountId: accountId, accountPool: pool }
        assert.equal(await api.reserveProviderAccountForFulfillment(request), null, 'active owner cannot be stolen')
        assert.equal(await locking.parkAccountLockForHandoff(redis, accountId, 'worker-a', 'operation-1'), true)
        assert.equal(await api.reserveProviderAccountForFulfillment({ ...request, operationId: 'operation-2' }), null)
        const parked = await redis.get(key)
        const winner = await api.reserveProviderAccountForFulfillment(request)
        assert.ok(winner)
        assert.equal(winner.lease.workerId, 'worker-b')
        assert.equal(await redis.get(key), null)
        assert.equal(await locking.transitionAccountLockToExecutionLease(redis, {
            accountId, operationId: 'operation-1', reservationGeneration: 1, workerId: 'worker-c',
            leaseId: randomUUID(), expectedLegacyOwner: parked!,
        }), null, 'competing stale handoff cannot replace the winner')
        assert.equal(await locking.assertAccountExecutionLease(redis, winner.lease), true)
        await locking.releaseAccountExecutionLease(redis, winner.lease)
    } finally {
        await redis.del(key, locking.buildAccountExecutionLeaseKey(accountId), `bein:account:fence:${accountId}`)
        await redis.quit()
    }
})

test('handoff refuses missing, changed and foreign owners before publication', async () => {
    const raw = locking.buildAccountLockOwnerValue({ workerId: 'worker-a', operationId: 'operation-1' })
    let calls = 0
    const redis = { get: async () => raw, eval: async () => { calls++; return 0 }, ttl: async () => 100 }
    assert.equal(await locking.parkAccountLockForHandoff(redis, 'account-1', 'worker-b', 'operation-1'), false)
    assert.equal(await locking.parkAccountLockForHandoff(redis, 'account-1', 'worker-a', 'operation-2'), false)
    assert.equal(calls, 0)
    assert.equal(await locking.parkAccountLockForHandoff(redis, 'account-1', 'worker-a', 'operation-1'), false)
    assert.equal(calls, 1, 'lost CAS must not publish a handoff')
})
