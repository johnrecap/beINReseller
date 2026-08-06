import assert from 'node:assert/strict'
import test from 'node:test'
import {
    buildOperationSpendReleasePreflight,
    type OperationSpendReleasePreflightDb,
} from '../../shared/points/operation-spend-release-preflight'

type MockPreflightInput = {
    cutoverAt?: Date | null
    staleCount?: number
    exhaustedCount?: number
    missingCount?: number
    unlinkedCount?: number
    postCutoverUnlinkedCount?: number
}

function createPreflightDb(input: MockPreflightInput) {
    const observedTakes: number[] = []
    const stateRows = {
        CAPTURED: [{ id: 'run-captured', operationId: 'operation-captured' }],
        AWARDED: [{ id: 'run-awarded', operationId: 'operation-awarded' }],
        SKIPPED: [{ id: 'run-skipped', operationId: 'operation-skipped' }],
        LEGACY_REVIEW_REQUIRED: [{ id: 'run-review', operationId: 'operation-review' }],
    }
    const db = {
        pointProgramSettings: {
            async findUnique() {
                return { operationSpendSnapshotCutoverAt: input.cutoverAt ?? null }
            },
        },
        operationSpendAwardRun: {
            async groupBy() {
                return [
                    { status: 'CAPTURED', _count: { _all: 7 } },
                    { status: 'AWARDED', _count: { _all: 11 } },
                    { status: 'SKIPPED', _count: { _all: 13 } },
                    { status: 'LEGACY_REVIEW_REQUIRED', _count: { _all: 2 } },
                ]
            },
            async count(args: Record<string, Record<string, unknown>>) {
                return 'OR' in args.where ? input.exhaustedCount ?? 0 : input.staleCount ?? 0
            },
            async findMany(args: Record<string, unknown>) {
                observedTakes.push(args.take as number)
                const where = args.where as Record<string, unknown>
                if ('OR' in where) {
                    return input.exhaustedCount
                        ? [{ id: 'run-exhausted', operationId: 'operation-exhausted' }]
                        : []
                }
                if ('capturedAt' in where) {
                    return input.staleCount
                        ? [{ id: 'run-stale', operationId: 'operation-stale' }]
                        : []
                }
                return stateRows[where.status as keyof typeof stateRows]
            },
        },
        pointLedgerEntry: {
            async count(args: Record<string, Record<string, unknown>>) {
                return 'createdAt' in args.where
                    ? input.postCutoverUnlinkedCount ?? 0
                    : input.unlinkedCount ?? 0
            },
            async findMany(args: Record<string, unknown>) {
                observedTakes.push(args.take as number)
                const where = args.where as Record<string, unknown>
                const count = 'createdAt' in where
                    ? input.postCutoverUnlinkedCount
                    : input.unlinkedCount
                return count ? [{ id: 'ledger-safe-id', operationId: 'operation-ledger' }] : []
            },
        },
        operation: {
            async count() {
                return input.missingCount ?? 0
            },
            async findMany(args: Record<string, unknown>) {
                observedTakes.push(args.take as number)
                return input.missingCount ? [{ id: 'operation-missing' }] : []
            },
        },
    }
    return {
        db: db as unknown as OperationSpendReleasePreflightDb,
        observedTakes,
    }
}

test('preflight reports complete totals with bounded safe samples', async () => {
    const { db, observedTakes } = createPreflightDb({
        unlinkedCount: 8,
    })
    const preflight = await buildOperationSpendReleasePreflight({
        db,
        now: new Date('2026-08-06T12:00:00.000Z'),
        sampleLimit: 2,
    })

    assert.equal(preflight.runStates.CAPTURED.count, 7)
    assert.deepEqual(preflight.runStates.CAPTURED.runIds, ['run-captured'])
    assert.equal(preflight.unlinkedOperationSpendLedger.count, 8)
    assert.equal(preflight.postCutoverUnlinkedLedger.count, 0)
    assert.deepEqual(preflight.activation, { ready: true, blockers: [] })
    assert.ok(observedTakes.every((take) => take === 2))
})

test('historical unlinked ledger is reported without blocking first activation', async () => {
    const { db } = createPreflightDb({ unlinkedCount: 3 })
    const preflight = await buildOperationSpendReleasePreflight({
        db,
        now: new Date('2026-08-06T12:00:00.000Z'),
    })

    assert.equal(preflight.cutoverAt, null)
    assert.equal(preflight.unlinkedOperationSpendLedger.count, 3)
    assert.equal(preflight.activation.ready, true)
})

test('preflight blocks unresolved stale, exhausted, and post-cutover invariants', async () => {
    const { db } = createPreflightDb({
        cutoverAt: new Date('2026-08-06T11:00:00.000Z'),
        staleCount: 2,
        exhaustedCount: 1,
        missingCount: 3,
        unlinkedCount: 9,
        postCutoverUnlinkedCount: 4,
    })
    const preflight = await buildOperationSpendReleasePreflight({
        db,
        now: new Date('2026-08-06T12:00:00.000Z'),
        sampleLimit: 5,
    })

    assert.deepEqual(preflight.activation, {
        ready: false,
        blockers: [
            'STALE_CAPTURED_RUNS',
            'FINALIZATION_RETRIES_EXHAUSTED',
            'POST_CUTOVER_MISSING_RUNS',
            'POST_CUTOVER_UNLINKED_LEDGER',
        ],
    })
    assert.equal(preflight.staleCapturedRuns.count, 2)
    assert.equal(preflight.retryExhaustedRuns.count, 1)
    assert.equal(preflight.postCutoverMissingRuns.count, 3)
    assert.equal(preflight.postCutoverUnlinkedLedger.count, 4)
})

test('preflight refuses an unsafe sample limit even when called outside a command', async () => {
    const { db } = createPreflightDb({})
    await assert.rejects(
        buildOperationSpendReleasePreflight({
            db,
            now: new Date('2026-08-06T12:00:00.000Z'),
            sampleLimit: 1_001,
        }),
        /INVALID_SAMPLE_LIMIT/,
    )
})
