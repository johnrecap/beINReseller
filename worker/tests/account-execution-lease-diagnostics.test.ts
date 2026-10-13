import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'

const handle = {
    accountId: 'account-1', operationId: 'operation-1', reservationGeneration: 2,
    leaseId: 'SECRET_LEASE_ID', fencingToken: 3, workerId: 'worker-1',
    acquiredAt: '2026-10-13T07:31:33.000Z',
}

for (const [reservationActive, redisOwnerCurrent, expectedReason] of [
    [false, true, 'RESERVATION_INACTIVE'],
    [true, false, 'REDIS_OWNER_LOST'],
    [true, true, null],
] as const) {
    test(`execution assertion reports ${expectedReason ?? 'success'} without exposing the lease`, async () => {
        const logs: string[] = []
        let redisChecks = 0
        const poolModule = loadIsolatedModule<{
            AccountPoolManager: new () => { assertExecutionLease: (lease: typeof handle) => Promise<boolean> }
        }>('worker/src/pool/account-pool-manager.ts', {
            '../lib/prisma': { prisma: {} },
            '../lib/redis': { getRedisConnection: () => ({}) },
            './rate-limiter': {},
            './account-locking': { assertAccountExecutionLease: async () => {
                redisChecks++
                return redisOwnerCurrent
            } },
            '../lib/crypto': {},
            '../lib/provider-account-reservation': {
                assertActiveProviderAccountReservation: async () => reservationActive,
            },
        }, [], {}, { console: { warn: (...parts: unknown[]) => logs.push(parts.join(' ')) } })

        const pool = new poolModule.AccountPoolManager()
        assert.equal(await pool.assertExecutionLease(handle), reservationActive && redisOwnerCurrent)
        assert.equal(redisChecks, reservationActive ? 1 : 0)
        if (expectedReason) assert.match(logs.join('\n'), new RegExp(expectedReason))
        else assert.equal(logs.length, 0)
        assert.doesNotMatch(logs.join('\n'), /SECRET_LEASE_ID/)
    })
}
