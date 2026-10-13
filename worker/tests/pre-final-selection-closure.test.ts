import test from 'node:test'
import assert from 'node:assert/strict'
import { OperationStatus, Prisma } from '@prisma/client'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as packageQuote from '../../shared/operations/package-quote'

const selected = { index: 0, name: 'Together 3 Months (3 Months)', price: 27,
    currency: 'USD', quoteRevision: 0, packageKey: '0.0', appliedPromoCode: null }

function makeOperation(finalMarker: 'none' | 'stage' | 'timestamp' = 'none') {
    return {
        id: 'synthetic-operation', type: 'RENEW', purpose: 'RENEWAL', status: 'COMPLETING',
        renewalFlowVersion: 2, userId: 'synthetic-user', customerId: null, beinAccountId: 'synthetic-account',
        cardNumber: '7000000001', amount: 0, selectedPackage: selected,
        responseData: { quoteRevision: 0, operationPhase: 'PROVIDER_SALE_PREPARATION_STARTED',
            providerMutationMayHaveStarted: true, providerPreparationMutationStartedAt: '2026-10-13T01:00:00Z',
            finalPaySubmitted: false,
            ...(finalMarker === 'timestamp' ? { finalPayRequestStartedAt: '2026-10-13T01:00:01Z' } : {}) },
        providerMutationStartedAt: null, providerMutationStage: finalMarker === 'stage' ? 'FINAL_OK' : null,
        providerPaymentState: 'NOT_SUBMITTED', fulfillmentState: 'UNVERIFIED', fulfillmentAuthority: 'NONE',
        transactions: [], refundSettlements: [], chargedBeinSpendLedger: null, fulfillmentProof: null,
        manualFulfillmentEvidence: null, storeSubscription: null, dispatches: [],
    }
}

for (const finalMarker of ['none', 'stage', 'timestamp'] as const) {
    test(`Sell quote conflict ${finalMarker === 'none' ? 'ends without payment review' : `preserves review after ${finalMarker} marker`}`, async () => {
        const operation = makeOperation(finalMarker)
        const releases: string[] = []
        const tx = {
            operation: {
                findUnique: async () => operation,
                updateMany: async ({ data }: { data: Record<string, unknown> }) => {
                    Object.assign(operation, data); return { count: 1 }
                },
            },
            beinAccountSpendLedger: { count: async () => 0 },
            operationDispatch: { updateMany: async () => { releases.push('dispatch') } },
            cardLifecycleReservation: { updateMany: async () => { releases.push('card') } },
            providerAccountCausalReservation: { updateMany: async () => { releases.push('account') } },
        }
        const { holdQuoteConflict } = loadIsolatedModule<{
            holdQuoteConflict: (db: unknown, input: unknown, fence: () => Promise<void>) => Promise<boolean>
        }>('worker/src/lib/promo-quote.ts', {
            '../../../shared/operations/package-quote': packageQuote,
            '../../../shared/operations/financial-lock': { lockFinancialOperation: async () => true },
        })
        const db = { $transaction: async (run: (value: typeof tx) => Promise<boolean>) => run(tx) }
        assert.equal(await holdQuoteConflict(db, { operationId: operation.id, revision: 0,
            selectedPackage: selected, preSale: { beinAccountId: operation.beinAccountId },
            reasonCode: 'CART_HEADERS_UNVERIFIED' }, async () => undefined), true)
        assert.equal(operation.status, finalMarker === 'none' ? 'FAILED' : 'REVIEW_REQUIRED')
        assert.deepEqual(releases, finalMarker === 'none' ? ['dispatch', 'card', 'account'] : [])
        const response = typeof operation.responseData === 'string'
            ? JSON.parse(operation.responseData) : operation.responseData
        assert.equal(response.quoteConflictReason, 'CART_HEADERS_UNVERIFIED')
    })
}

for (const [label, finalMarker, preparedForConfirmation] of [
    ['preparation failure', 'none', false],
    ['prepared confirmation cancellation before OK', 'none', true],
    ['final stage marker', 'stage', false],
    ['final timestamp marker', 'timestamp', false],
] as const) {
    test(`non-cart ${label} ${finalMarker === 'none' ? 'releases account and card' : 'requires review'}`, async () => {
        const operation = makeOperation(finalMarker)
        if (preparedForConfirmation) {
            operation.status = 'AWAITING_FINAL_CONFIRM'
            operation.responseData.operationPhase = 'FINAL_CONFIRMATION_REQUESTED'
        }
        const releases: string[] = []
        const tx = {
            $queryRaw: async () => [{ id: operation.id }],
            operation: {
                findUnique: async () => operation,
                updateMany: async ({ data }: { data: Record<string, unknown> }) => {
                    Object.assign(operation, data); return { count: 1 }
                },
            },
            beinAccountSpendLedger: { count: async () => 0 },
            cardLifecycleReservation: { updateMany: async () => { releases.push('card') } },
            providerAccountCausalReservation: { updateMany: async () => { releases.push('account') } },
        }
        const prisma = { $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) }
        const { finalizePreMutationRenewalTermination } = loadIsolatedModule<{
            finalizePreMutationRenewalTermination: (input: unknown) => Promise<{ status: string }>
        }>('worker/src/lib/pre-mutation-renewal-finalization.ts', {
            '@prisma/client': { OperationStatus, Prisma }, './prisma': { prisma },
        })
        const result = await finalizePreMutationRenewalTermination({ operationId: operation.id,
            terminalStatus: 'FAILED', allowedStatuses: [operation.status as OperationStatus],
            responseMessage: 'PACKAGE_SELECTION_UNVERIFIED', releaseReason: 'SYNTHETIC_PRE_FINAL_FAILURE' })
        assert.equal(result.status, finalMarker === 'none' ? 'TERMINATED' : 'REVIEW_REQUIRED')
        assert.equal(operation.status, finalMarker === 'none' ? 'FAILED' : 'REVIEW_REQUIRED')
        assert.deepEqual(releases.sort(), finalMarker === 'none' ? ['account', 'card'] : [])
    })
}
