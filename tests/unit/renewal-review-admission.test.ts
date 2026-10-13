import test from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma } from '@prisma/client'
import { createGuardedRenewalOperation } from '../../src/lib/operations/renewal-creation-guard'
import { finalProviderMutationMayHaveStarted } from '../../shared/operations/renewal-pre-payment'

test('an unresolved review and open evidence do not block a new renewal after cooldown', async () => {
    let created = 0
    const tx = {
        $queryRaw: async () => [],
        cardAdministrativeRelease: { findFirst: async () => ({ operations: [{ id: 'old' }] }) },
        operationIntegrityIssue: { findFirst: async () => ({ operationId: 'old' }) },
        operation: {
            findFirst: async ({ where }: { where: { status?: unknown } }) =>
                where.status === 'REVIEW_REQUIRED' ? { id: 'old' } : null,
            findUnique: async () => ({ id: 'new', status: 'PENDING', administrativeStopRequestedAt: null }),
            create: async () => { created++; return { id: 'new' } },
        },
        cardLifecycleReservation: { findFirst: async () => null, findUnique: async () => null,
            create: async () => ({ operationId: 'new' }) },
    } as unknown as Prisma.TransactionClient
    await createGuardedRenewalOperation(tx, { cardNumber: '7000000001', data: { userId: 'user', amount: 0 } })
    assert.equal(created, 1)
})

for (const serialized of [false, true]) test(`cancel preparation is not payment (JSON string=${serialized})`, () => {
    const data = { operationPhase: 'CANCELLATION_CONFIRM', providerMutationMayHaveStarted: true, finalPaySubmitted: false }
    const op = { status: 'COMPLETING', renewalFlowVersion: 2, providerPaymentState: 'NOT_SUBMITTED',
        responseData: serialized ? JSON.stringify(data) : data }
    assert.equal(finalProviderMutationMayHaveStarted(op), false)
    assert.equal(finalProviderMutationMayHaveStarted({ ...op, providerMutationStage: 'FINAL_OK' }), true)
    assert.equal(finalProviderMutationMayHaveStarted({ ...op, providerPaymentState: 'UNKNOWN' }), true)
})
