import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true'

test('persists expired waiting operation through shared recovery', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { recoverOperationIfNeeded } = await import('@/lib/operations/recovery')

    const operation = await prisma.operation.create({
        data: {
            type: 'RENEW',
            cardNumber: `test-${Date.now()}`,
            amount: 0,
            status: 'AWAITING_PACKAGE',
            finalConfirmExpiry: new Date('2026-05-24T10:00:00.000Z'),
        },
    })

    try {
        const result = await recoverOperationIfNeeded(operation.id, 'maintenance', {
            now: new Date('2026-05-24T10:02:00.000Z'),
        })
        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            select: { status: true, finalConfirmExpiry: true, heartbeatExpiry: true },
        })

        assert.equal(result.changed, true)
        assert.equal(result.decision, 'EXPIRE')
        assert.equal(updated.status, 'EXPIRED')
        assert.equal(updated.finalConfirmExpiry, null)
        assert.equal(updated.heartbeatExpiry, null)
    } finally {
        await prisma.operation.deleteMany({ where: { id: operation.id } })
    }
})

test('owner-safe account lock release preserves foreign Redis lock', { skip: !runDbIntegration }, async () => {
    const { default: redis } = await import('@/lib/redis')
    const {
        getAccountLockKey,
        releaseAccountLockSafely,
    } = await import('@/lib/operations/account-lock-release')

    const accountId = `test-account-${Date.now()}`
    const key = getAccountLockKey(accountId)

    await redis.set(key, 'worker-live', 'EX', 60)

    try {
        const result = await releaseAccountLockSafely(redis, accountId, 'recovery-owner')
        const ownerAfter = await redis.get(key)

        assert.equal(result.released, false)
        assert.equal(result.reason, 'owner_mismatch')
        assert.equal(ownerAfter, 'worker-live')
    } finally {
        await redis.del(key)
    }
})

test('maintenance recovers stale processing operation', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { runOperationMaintenanceCycle } = await import('@/lib/maintenance/operation-maintenance-runner')

    const operation = await prisma.operation.create({
        data: {
            type: 'RENEW',
            cardNumber: `test-processing-${Date.now()}`,
            amount: 0,
            status: 'PROCESSING',
            updatedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
    })

    try {
        const summary = await runOperationMaintenanceCycle({ staleLimit: 10 })
        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            select: { status: true },
        })

        assert.equal(updated.status, 'EXPIRED')
        assert.equal(summary.changed > 0, true)
    } finally {
        await prisma.operation.deleteMany({ where: { id: operation.id } })
    }
})
