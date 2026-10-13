import test from 'node:test'
import assert from 'node:assert/strict'
import { OperationStatus, Prisma } from '@prisma/client'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'

test('safe pre-payment closure resolves its stale issue and repairs replay without a second settlement', async () => {
    const operation = {
        id: 'synthetic-hold', type: 'RENEW', purpose: 'RENEWAL', status: 'COMPLETING',
        userId: 'synthetic-user', customerId: null, beinAccountId: 'synthetic-account', amount: 0,
        renewalFlowVersion: 2, providerPaymentState: 'NOT_SUBMITTED', providerMutationStartedAt: null,
        providerMutationStage: null, fulfillmentState: 'UNVERIFIED', fulfillmentAuthority: 'NONE',
        responseData: { operationPhase: 'PROVIDER_SALE_PREPARATION_STARTED', finalPaySubmitted: false,
            providerMutationMayHaveStarted: true }, transactions: [], dispatches: [], refundSettlements: [],
        chargedBeinSpendLedger: null, fulfillmentProof: null, manualFulfillmentEvidence: null,
    }
    let issueOpen = true
    let cardHeld = true
    let accountHeld = true
    const tx = {
        $queryRaw: async () => [{ id: operation.id }],
        operation: { findUnique: async () => operation,
            updateMany: async ({ data }: { data: object }) => { Object.assign(operation, data); return { count: 1 } } },
        beinAccountSpendLedger: { count: async () => 0 },
        operationIntegrityIssue: {
            updateMany: async () => { const count = issueOpen ? 1 : 0; issueOpen = false; return { count } },
            count: async () => issueOpen ? 1 : 0,
        },
        operationDispatch: { updateMany: async () => ({ count: 0 }) },
        cardLifecycleReservation: { updateMany: async () => { cardHeld = false; return { count: 1 } } },
        providerAccountCausalReservation: { updateMany: async () => { accountHeld = false; return { count: 1 } } },
    }
    const prisma = { $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) }
    const { finalizePreMutationRenewalTermination } = loadIsolatedModule<{
        finalizePreMutationRenewalTermination: (input: unknown) => Promise<{ status: string }>
    }>('worker/src/lib/pre-mutation-renewal-finalization.ts', {
        '@prisma/client': { OperationStatus, Prisma }, './prisma': { prisma },
    })
    const input = { operationId: operation.id, terminalStatus: 'FAILED', allowedStatuses: ['COMPLETING'],
        responseMessage: 'PACKAGE_SELECTION_UNVERIFIED', releaseReason: 'SAFE_TERMINAL:PRE_PAYMENT_TEST' }
    assert.equal((await finalizePreMutationRenewalTermination(input)).status, 'TERMINATED')
    assert.equal(issueOpen, false, 'a finished safe attempt must not keep blocking its card through a stale issue')
    assert.equal(cardHeld || accountHeld, false)
    // Simulate leftovers from a historical partial closure; replay must repair,
    // without reopening the operation or inventing a refund.
    issueOpen = true; cardHeld = true; accountHeld = true
    assert.equal((await finalizePreMutationRenewalTermination(input)).status, 'ALREADY_TERMINATED')
    assert.equal(issueOpen || cardHeld || accountHeld, false)
    assert.equal(operation.status, 'FAILED')
})
