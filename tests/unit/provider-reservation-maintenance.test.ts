import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import { hasRecoveryProviderCompletionProof } from '../../src/lib/operations/recovery-proof'
import { getOperationPhaseEvidence, hasOperationFinancialExposureForReview } from '../../src/lib/operation-safety'

function fixture(changes: Record<string, unknown> = {}) {
    const op = { id: 'operation', type: 'RENEW', purpose: 'RENEWAL', status: 'COMPLETED', beinAccountId: 'account', cardNumber: '1000000000',
        fulfillmentState: 'VERIFIED', fulfillmentAuthority: 'AUTOMATED_COMPOSITE', providerPaymentState: 'CHARGED',
        providerMutationStartedAt: new Date(), providerMutationStage: 'FINAL_OK', responseData: {},
        fulfillmentProof: { id: 'proof', operationId: 'operation', beinAccountId: 'account', cardNumberSnapshot: '1000000000',
            invoiceNo: '100', proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION' },
        chargedBeinSpendLedger: { id: 'ledger' }, manualFulfillmentEvidence: null, cardLifecycleReservation: null,
        integrityIssues: [], ...changes }
    const reservation = { id: 'reservation', operationId: 'operation', beinAccountId: 'account', reservationGeneration: 3 }
    const state = { leased: false, generation: 3, released: false, writes: [] as unknown[], queries: [] as unknown[] }
    const db = {
        $queryRaw: async () => [{ id: 'operation' }],
        operation: { findUnique: async () => op },
        providerAccountCausalReservation: {
            findMany: async (query: unknown) => { state.queries.push(query); return state.released ? [] : [reservation] },
            updateMany: async ({ where, data }: { where: { reservationGeneration: number }; data: unknown }) => {
                if (where.reservationGeneration !== state.generation || state.released) return { count: 0 }
                state.released = true; state.writes.push(data); return { count: 1 }
            },
        },
        $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
    }
    const api = loadIsolatedModule<typeof import('../../src/lib/maintenance/provider-reservation-maintenance')>(
        'src/lib/maintenance/provider-reservation-maintenance.ts', {
            '@/lib/prisma': { default: db }, '@/lib/redis': { default: { exists: async () => state.leased ? 1 : 0 } },
            '@/lib/operations/recovery-proof': { hasRecoveryProviderCompletionProof },
            '@/lib/operation-safety': { getOperationPhaseEvidence, hasOperationFinancialExposureForReview },
        })
    return { ...api, op, state }
}
test('maintenance frees a proven completed paid renewal once without financial/card/status writes', async () => {
    const f = fixture()
    const before = JSON.stringify(f.op)
    assert.deepEqual(JSON.parse(JSON.stringify(await f.repairTerminalProviderReservations())), { inspected: 1, released: 1, held: 0, errors: [] })
    assert.equal((await f.repairTerminalProviderReservations()).released, 0)
    assert.equal(f.state.writes.length, 1)
    assert.equal(JSON.stringify(f.op), before)
    assert.match(JSON.stringify(f.state.writes), /PROVEN_RENEWAL_COMPLETED/)
})
test('manual provider confirmation releases only with its matching stored evidence', async () => {
    const f = fixture({ fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION', fulfillmentProof: null,
        manualFulfillmentEvidence: { id: 'manual', operationId: 'operation', beinAccountId: 'account', cardNumberSnapshot: '1000000000', invoiceNo: '101' } })
    assert.equal((await f.repairTerminalProviderReservations()).released, 1)
})
for (const status of ['FAILED', 'CANCELLED', 'EXPIRED']) {
    test(`maintenance frees ${status} after the domain finalizer closed the card`, async () => {
        const f = fixture({ status, providerPaymentState: 'NOT_CHARGED',
            cardLifecycleReservation: { releasedAt: new Date(), releaseReason: 'SAFE_TERMINAL:CONFIRMED_NO_CHARGE' } })
        assert.equal((await f.repairTerminalProviderReservations()).released, 1)
    })
}
test('an ended read-only card check does not reserve the account while waiting for Activate', async () => {
    const f = fixture({ type: 'SIGNAL_REFRESH', responseData: { awaitingActivate: true } })
    assert.equal((await f.repairTerminalProviderReservations()).released, 1)
    const source = readFileSync('worker/src/http-queue-processor.ts', 'utf8')
    const transaction = source.slice(source.indexOf('const signalCheckCompleted ='), source.indexOf('if (signalCheckCompleted.count'))
    assert.match(transaction, /providerAccountCausalReservation\.updateMany/)
    assert.match(transaction, /SAFE_TERMINAL:SIGNAL_CHECK_COMPLETED/)
})
test('maintenance preserves active work, uncertain payment, missing/mismatched proof and open review', async () => {
    for (const changes of [
        { status: 'PROCESSING' }, { status: 'COMPLETING' }, { status: 'REVIEW_REQUIRED' },
        { fulfillmentProof: null }, { fulfillmentState: 'UNVERIFIED' },
        { fulfillmentAuthority: 'NONE' }, { fulfillmentProof: { id: 'bad', invoiceNo: '100', beinAccountId: 'other' } },
        { status: 'FAILED', providerPaymentState: 'UNKNOWN' }, { integrityIssues: [{ id: 'review' }] },
    ]) {
        const f = fixture(changes)
        assert.equal((await f.repairTerminalProviderReservations()).released, 0, JSON.stringify(changes))
        assert.equal(f.state.writes.length, 0)
    }
})
test('a pre-payment stop is releasable only with explicit evidence before provider mutation', async () => {
    const f = fixture({ status: 'CANCELLED', providerPaymentState: 'NOT_SUBMITTED', providerMutationStartedAt: null,
        providerMutationStage: null, chargedBeinSpendLedger: null, responseData: { operationPhase: 'PACKAGE_PREPARATION' } })
    assert.equal((await f.repairTerminalProviderReservations()).released, 1)
    const contradictory = fixture({ ...f.op, responseData: { operationPhase: 'PACKAGE_PREPARATION',
        auditSnapshot: { outcomeCategory: 'UNCERTAIN_REVIEW_REQUIRED', refundBlocked: true } } })
    assert.equal((await contradictory.repairTerminalProviderReservations()).released, 0)
})
test('active Redis execution/legacy owners and replaced reservation generations are preserved', async () => {
    const f = fixture(); f.state.leased = true
    assert.equal((await f.repairTerminalProviderReservations()).released, 0)
    f.state.leased = false; f.state.generation = 4
    assert.equal((await f.repairTerminalProviderReservations()).released, 0)
    assert.equal(f.state.writes.length, 0)
})
test('maintenance runner invokes terminal account cleanup and reports it independently', () => {
    const source = readFileSync('src/lib/maintenance/operation-maintenance-runner.ts', 'utf8')
    assert.match(source, /await repairTerminalProviderReservations\(/)
    assert.match(source, /changed \+= providerReservations\.released/)
    assert.match(source, /providerReservations\.held/)
})
