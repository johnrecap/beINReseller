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
