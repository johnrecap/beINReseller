import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    buildRenewalVerificationJobId,
    repairDueRenewalVerificationJobs,
} from '@/lib/maintenance/renewal-fulfillment-verification-maintenance'

function due(operationId: string, attemptCount: number) {
    return {
        operationId,
        attemptCount,
        nextCheckAt: new Date('2026-08-24T15:40:00.000Z'),
        operation: { cardNumber: '7517687161' },
    }
}

test('maintenance uses the same deterministic next-attempt job identity as the Worker', () => {
    assert.equal(
        buildRenewalVerificationJobId('op-1', 3),
        'VERIFY_RENEWAL_FULFILLMENT--op-1--3'
    )
})

test('maintenance enqueues missing due jobs and leaves an active copy untouched', async () => {
        const added: Array<{
            data: { operationId: string; type: string; verificationAttempt?: number }
            options: { jobId: string }
        }> = []
        const result = await repairDueRenewalVerificationJobs({
            now: new Date('2026-08-24T15:41:00.000Z'),
            store: { findDue: async () => [due('missing', 1), due('active', 2)] },
            queue: {
                getJob: async (jobId) => jobId.includes('--active--')
                    ? { getState: async () => 'delayed', remove: async () => undefined }
                    : undefined,
                add: async (_name, data, options) => {
                    added.push({ data, options })
                    return undefined
                },
            },
        })

        assert.deepEqual(result, {
            inspected: 2,
            enqueued: 1,
            alreadyQueued: 1,
            replacedTerminalJob: 0,
            errors: [],
        })
        assert.equal(added.length, 1)
        assert.equal(added[0].data.operationId, 'missing')
        assert.equal(added[0].data.type, 'VERIFY_RENEWAL_FULFILLMENT')
        assert.equal(added[0].data.verificationAttempt, 2)
        assert.equal(added[0].options.jobId, 'VERIFY_RENEWAL_FULFILLMENT--missing--2')
})

test('maintenance replaces a terminal stale job when the database still says the attempt is due', async () => {
        let removed = 0
        let added = 0
        const result = await repairDueRenewalVerificationJobs({
            now: new Date('2026-08-24T15:41:00.000Z'),
            store: { findDue: async () => [due('crashed-before-enqueue', 3)] },
            queue: {
                getJob: async () => ({
                    getState: async () => 'completed',
                    remove: async () => { removed++ },
                }),
                add: async () => { added++; return undefined },
            },
        })

        assert.equal(removed, 1)
        assert.equal(added, 1)
        assert.equal(result.replacedTerminalJob, 1)
        assert.equal(result.enqueued, 1)
})

test('the operation-maintenance leader invokes and reports verification job repair', () => {
    const source = readFileSync(
        join(process.cwd(), 'src/lib/maintenance/operation-maintenance-runner.ts'),
        'utf8'
    )
    assert.match(source, /repairDueRenewalVerificationJobs\(\{/)
    assert.match(source, /verificationJobs: RenewalVerificationJobMaintenanceSummary/)
    assert.match(source, /verificationJobs\.enqueued/)
})

test('maintenance also continues a stranded matched attempt with no due timestamp', () => {
    const source = readFileSync(
        join(process.cwd(), 'src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts'),
        'utf8'
    )
    assert.match(source, /state: 'VERIFYING'/)
    assert.match(source, /nextCheckAt: null, lastOutcome: 'MATCHED'/)
    assert.match(source, /const verificationAttempt = verification\.attemptCount \+ 1/)
})
