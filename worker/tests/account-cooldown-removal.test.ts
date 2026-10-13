import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as reservations from '../src/lib/provider-account-reservation'
import type { AccountPoolManager } from '../src/pool/account-pool-manager'

function harness() {
    const account = { id: 'synthetic-account', isActive: true, automationExclusive: true,
        username: 'synthetic', label: 'Synthetic', cooldownUntil: new Date('2099-01-01'),
        consecutiveFailures: 3, totalSuccess: 10, totalFailures: 0, lastUsedAt: null }
    const state = { locked: false, lease: false, reserved: false, rateLimited: false, ttlReads: 0, cooldownWrites: 0 }
    const queries: unknown[] = []
    const updates: Record<string, unknown>[] = []
    const redis = { incr: async () => 0, ttl: async () => { state.ttlReads++; return 600 },
        setex: async () => { state.cooldownWrites++ }, del: async () => 0, zcard: async () => 0 }
    const db = {
        setting: { findMany: async () => [
            { key: 'pool_cooldown_after_failures', value: '1' },
            { key: 'pool_cooldown_duration_seconds', value: '99999' },
        ] },
        beinAccount: {
            findUnique: async () => account,
            findMany: async (query?: { where?: Record<string, unknown> }) => {
                queries.push(query)
                if (JSON.stringify(query ?? {}).includes('cooldownUntil')) return []
                if (query?.where && (!account.isActive || !account.automationExclusive || state.reserved)) return []
                return [account]
            },
            update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return account },
        },
        $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
    }
    const { AccountPoolManager: Pool } = loadIsolatedModule<{ AccountPoolManager: typeof AccountPoolManager }>(
        'worker/src/pool/account-pool-manager.ts', {
            '../lib/prisma': { prisma: db }, '../lib/redis': { getRedisConnection: () => redis },
            './rate-limiter': { checkRateLimit: async () => ({ allowed: !state.rateLimited, currentCount: state.rateLimited ? 5 : 0 }) },
            './account-locking': {
                isAccountLocked: async () => state.locked, isAccountExecutionLeaseActive: async () => state.lease,
                lockAccount: async () => true, unlockAccount: async () => true,
                acquireAccountExecutionLease: async (_redis: unknown, input: unknown) => input,
            },
            '../lib/crypto': { decryptAccountPassword: (value: unknown) => value },
            '../lib/provider-account-reservation': {
                ...reservations,
                findActiveProviderAccountReservationForAccount: async () => state.reserved ? { operationId: 'other' } : null,
                findActiveProviderAccountReservationForOperation: async () => null,
                acquireProviderAccountCausalReservation: async () => ({ status: 'ACQUIRED', reservation: { reservationGeneration: 1 } }),
                assertActiveProviderAccountReservation: async () => true,
            },
        })
    return { pool: new Pool(undefined, 'synthetic-worker'), state, account, queries, updates, redis, db }
}

test('old database and Redis account cooldowns do not prevent any pool acquisition path', async () => {
    const h = harness()
    assert.equal((await h.pool.getNextAvailableAccount('synthetic-operation'))?.id, h.account.id)
    assert.equal((await h.pool.getNextAvailableAccountExcluding([], 10, 'synthetic-operation'))?.id, h.account.id)
    assert.equal(await h.pool.hasAvailableAccount(), true)
    assert.equal((await h.pool.acquireReservedAccount({ operationId: 'synthetic-operation', leaseId: 'synthetic-lease',
        automaticWindowEndsAt: new Date(Date.now() + 60000) }))?.account.id, h.account.id)
    assert.equal(h.state.ttlReads, 0)
    for (const query of h.queries) {
        const where = (query as { where: Record<string, unknown> }).where
        assert.equal(where.isActive, true)
        assert.equal(where.automationExclusive, true)
        assert.match(JSON.stringify(where), /providerAccountCausalReservations/)
    }
})

test('failure tracking never creates a cooldown even with old nonzero settings', async () => {
    const h = harness()
    await h.pool.loadConfig()
    await h.pool.markAccountFailed(h.account.id, 'SYNTHETIC_FAILURE', 'synthetic-operation')
    assert.equal(h.state.cooldownWrites, 0)
    assert.equal(h.updates.length, 1)
    assert.equal(Object.hasOwn(h.updates[0], 'cooldownUntil'), false)
    h.account.consecutiveFailures = 5
    await h.pool.markAccountFailed(h.account.id, 'SYNTHETIC_FAILURE', 'synthetic-operation')
    assert.equal(h.updates.at(-1)?.isActive, false, 'permanent auto-disable setting remains independent')
})

test('removing cooldowns preserves account eligibility, ownership and rate-limit checks', async () => {
    for (const blocker of ['locked', 'lease', 'reserved', 'rateLimited'] as const) {
        const h = harness()
        h.state[blocker] = true
        assert.equal((await h.pool.checkAccountHealth(h.account.id)).isAvailable, false, blocker)
    }
    for (const field of ['isActive', 'automationExclusive'] as const) {
        const h = harness()
        h.account[field] = false
        assert.equal((await h.pool.checkAccountHealth(h.account.id)).isAvailable, false, field)
    }
})

test('pool and health statistics ignore historical cooldown keys', async () => {
    const h = harness()
    const status = await h.pool.getPoolStatus()
    assert.equal(status.availableNow, 1)
    assert.equal(status.inCooldown, 0)
    const health = loadIsolatedModule<typeof import('../src/pool/health-checker')>('worker/src/pool/health-checker.ts', {
        '../lib/prisma': { prisma: h.db }, '../lib/provider-account-reservation': {
            ...reservations, findActiveProviderAccountReservationForAccount: async () => null,
        },
    })
    assert.equal((await health.getAccountHealthReport(h.redis as never, h.account.id)).metrics.cooldownRemaining, null)
    assert.equal(h.state.ttlReads, 0)
})
