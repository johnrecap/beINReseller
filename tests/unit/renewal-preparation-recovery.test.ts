import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

const activeLeaseOwner = JSON.stringify({
    operationId: 'operation-1',
    reservationGeneration: 2,
    leaseId: 'lease-1',
    fencingToken: 3,
    workerId: 'worker-1',
    acquiredAt: '2026-10-13T07:31:33.000Z',
})

test('recovery recognizes only the live execution owner for the same operation', async () => {
    const keys: string[] = []
    const recoveryLocks = loadIsolatedModule<{
        executionLeaseOwnedByOperation: (owner: string | null, operationId: string) => boolean
        hasActiveProviderExecutionLeaseForOperation: (accountId: string, operationId: string) => Promise<boolean>
    }>('src/lib/operations/recovery-locks.ts', {
        '@/lib/redis': { default: { get: async (key: string) => { keys.push(key); return activeLeaseOwner } } },
    })

    assert.equal(recoveryLocks.executionLeaseOwnedByOperation(activeLeaseOwner, 'operation-1'), true)
    assert.equal(recoveryLocks.executionLeaseOwnedByOperation(activeLeaseOwner, 'other-operation'), false)
    assert.equal(recoveryLocks.executionLeaseOwnedByOperation(null, 'operation-1'), false)
    assert.equal(recoveryLocks.executionLeaseOwnedByOperation('{', 'operation-1'), false)
    assert.equal(recoveryLocks.executionLeaseOwnedByOperation(JSON.stringify({ operationId: 'operation-1' }), 'operation-1'), false)
    assert.equal(await recoveryLocks.hasActiveProviderExecutionLeaseForOperation('account-1', 'operation-1'), true)
    assert.deepEqual(keys, ['bein:account:execution-lease:account-1'])
})

test('recovery leaves in-flight Add/Sell/STB operation and reservation untouched', async () => {
    let transactionCount = 0
    let releaseCount = 0
    let classifierCount = 0
    const logs: string[] = []
    const recovery = loadIsolatedModule<{
        recoverOperationIfNeeded: (operationId: string, source: 'maintenance') => Promise<{
            changed: boolean; skipped?: boolean; newStatus?: string; reason: string; financialImpact: string
        }>
    }>('src/lib/operations/recovery.ts', {
        '@/lib/prisma': { default: {
            $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
                transactionCount++
                return callback({ operation: { findUnique: async () => ({
                    id: 'operation-1', status: 'COMPLETING', beinAccountId: 'account-1',
                }) } })
            },
        } },
        '@/lib/redis': { default: {} },
        '@/lib/operations/recovery-classifier': { classifyRecovery: () => { classifierCount++; throw Error('unexpected classifier') } },
        '@/lib/operations/recovery-proof': {},
        '@/lib/operations/recovery-locks': {
            acquireRecoveryLock: async () => ({ key: 'lock', owner: 'owner' }),
            hasActiveProviderExecutionLeaseForOperation: async (accountId: string, operationId: string) => {
                assert.equal(accountId, 'account-1')
                assert.equal(operationId, 'operation-1')
                return true
            },
            releaseRecoveryLock: async () => { releaseCount++; return true },
        },
        '@/lib/operation-safety': {},
        '@/lib/operations/account-lock-release': {},
        '@/lib/operations/recovery-evidence': {},
        '@/lib/points/operation-spend-award-runs': {},
        '@/lib/points/reversals': {},
        '../../../shared/operations/financial-lock': { lockFinancialOperation: async () => true },
        '../../../shared/operations/audit-financial-context': {},
    }, [], {}, { console: { info: (...parts: unknown[]) => logs.push(parts.join(' ')) } })

    const result = await recovery.recoverOperationIfNeeded('operation-1', 'maintenance')
    assert.equal(transactionCount, 1)
    assert.equal(releaseCount, 1)
    assert.equal(classifierCount, 0)
    assert.equal(result.changed, false)
    assert.equal(result.skipped, true)
    assert.equal(result.newStatus, 'COMPLETING')
    assert.equal(result.reason, 'active_provider_execution')
    assert.equal(result.financialImpact, 'UNCERTAIN')
    assert.match(logs.join('\n'), /Active provider execution; recovery deferred/)
})

test('maintenance logs the operation and recovery reason without provider details', async () => {
    const logs: string[] = []
    const runner = loadIsolatedModule<{
        runOperationMaintenanceCycle: () => Promise<{ changed: number }>
    }>('src/lib/maintenance/operation-maintenance-runner.ts', {
        'node:crypto': { default: crypto },
        '@/lib/prisma': { default: { cardAdministrativeRelease: { findMany: async () => [] }, operation: { findMany: async () => [{ id: 'operation-1' }] } } },
        '@/lib/redis': { default: { set: async () => 'OK' } },
        '@/lib/operations/recovery': { recoverOperationIfNeeded: async () => ({
            changed: true, skipped: false, previousStatus: 'COMPLETING', newStatus: 'EXPIRED',
            decision: 'EXPIRE', reason: 'completion_timeout', reviewRequired: false,
            refundApplied: false, privateProviderResponse: 'SECRET_PROVIDER_HTML',
        }) },
        '@/lib/operation-dispatch': { runDispatchWatchdog: async () => ({
            scanned: 0, recovered: 0, skipped: 0, retried: 0, review: 0, refunded: 0, errors: [],
        }) },
        '@/lib/maintenance/operation-spend-award-run-maintenance': {
            retryStaleCapturedOperationSpendAwardRuns: async () => ({
                inspected: 0, awarded: 0, alreadyFinalized: 0, skipped: 0, reviewRequired: 0,
                notFound: 0, retryScheduled: 0, retryExhausted: 0, errors: [],
            }),
        },
        '@/lib/maintenance/renewal-fulfillment-verification-maintenance': {
            repairDueRenewalVerificationJobs: async () => ({
                inspected: 0, enqueued: 0, alreadyQueued: 0, replacedTerminalJob: 0, errors: [],
            }),
        },
        '@/lib/maintenance/completion-effect-maintenance': { repairCompletionEffects: async () => ({
            inspected: 0, delivered: 0, retryScheduled: 0, exhaustedCount: 0,
        }) },
        '@/lib/maintenance/provider-reservation-maintenance': { repairTerminalProviderReservations: async () => ({
            inspected: 0, released: 0, held: 0, errors: [],
        }) },
        '@/lib/maintenance/renewal-hold-maintenance': { repairRenewalHolds: async () => ({ inspected: 0, repaired: 0, held: 0, errors: [] }) },
    }, [], {}, { console: {
        info: (...parts: unknown[]) => logs.push(parts.join(' ')),
        log: (...parts: unknown[]) => logs.push(parts.join(' ')),
        error: (...parts: unknown[]) => logs.push(parts.join(' ')),
    } })

    const summary = await runner.runOperationMaintenanceCycle()
    assert.equal(summary.changed, 1)
    assert.match(logs.join('\n'), /Operation recovery:.*operation-1.*completion_timeout/)
    assert.doesNotMatch(logs.join('\n'), /SECRET_PROVIDER_HTML/)
})
