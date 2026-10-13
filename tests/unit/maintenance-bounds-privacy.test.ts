import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

function loadMaintenance() {
    const secretFailure = () => { throw new Error('SYNTHETIC_PRIVATE_PROVIDER_PAYLOAD') }
    return loadIsolatedModule<{
        boundedBatch: (value: number) => number
        runOperationMaintenanceCycle: () => Promise<{ errors: string[] }>
    }>('src/lib/maintenance/operation-maintenance-runner.ts', {
        'node:crypto': { default: crypto },
        '@/lib/prisma': { default: { cardAdministrativeRelease: { findMany: async () => [] }, operation: { findMany: async () => [{ id: 'synthetic-operation' }] } } },
        '@/lib/redis': { default: { set: secretFailure } },
        '@/lib/operations/recovery': { recoverOperationIfNeeded: secretFailure },
        '@/lib/operation-dispatch': { runDispatchWatchdog: async () => ({ scanned: 0, recovered: 0, skipped: 0, retried: 0, review: 0, refunded: 0, errors: [] }) },
        '@/lib/maintenance/operation-spend-award-run-maintenance': { retryStaleCapturedOperationSpendAwardRuns: secretFailure },
        '@/lib/maintenance/renewal-fulfillment-verification-maintenance': { repairDueRenewalVerificationJobs: secretFailure },
        '@/lib/maintenance/completion-effect-maintenance': { repairCompletionEffects: secretFailure },
        '@/lib/maintenance/provider-reservation-maintenance': { repairTerminalProviderReservations: secretFailure },
        '@/lib/maintenance/renewal-hold-maintenance': { repairRenewalHolds: secretFailure },
    }, ['boundedBatch'])
}

test('T034 maintenance rejects unbounded scans at every batch input', () => {
    const { boundedBatch } = loadMaintenance()
    for (const [input, expected] of [[NaN, 50], [Infinity, 50], [-1, 1], [0, 1], [1.9, 1], [201, 200], [50, 50]]) {
        assert.equal(boundedBatch(input), expected)
    }
})

test('T034 maintenance logs safe context without raw provider/connection exceptions', async () => {
    const logs: string[] = []
    const previous = { error: console.error, log: console.log }
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '))
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '))
    try {
        const result = await loadMaintenance().runOperationMaintenanceCycle()
        assert.ok(result.errors.includes('synthetic-operation'))
        assert.equal(logs.join('\n').includes('SYNTHETIC_PRIVATE_PROVIDER_PAYLOAD'), false)
    } finally {
        console.error = previous.error
        console.log = previous.log
    }
})
