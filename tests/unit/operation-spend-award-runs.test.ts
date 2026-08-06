import test from 'node:test'
import assert from 'node:assert/strict'
import {
    captureOperationSpendAwardRunInTransaction,
    finalizeOperationSpendAwardRun,
    OPERATION_SPEND_FINALIZATION_ERROR_CODE,
    OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON,
    OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS,
    resolveOperationSpendFinalizationFailure,
} from '../../src/lib/points/operation-spend-award-runs'

type MemoryState = ReturnType<typeof initialState>

function initialState() {
    const completedAt = new Date('2026-08-06T10:00:00.000Z')
    return {
        operation: {
            id: 'operation-1',
            customerId: null as string | null,
            userId: 'user-1',
            status: 'COMPLETED',
            type: 'RENEW',
            amount: 1000,
            completedAt,
            user: {
                id: 'user-1',
                role: 'USER',
                isActive: true,
                deletedAt: null,
                createdBy: null,
                managerLink: [],
                agentAssignmentAsUser: [{
                    id: 'assignment-1',
                    agentId: 'agent-1',
                    isActive: true,
                    updatedAt: completedAt,
                    agent: {
                        id: 'agent-1',
                        role: 'AGENT',
                        isActive: true,
                        deletedAt: null,
                    },
                }],
            },
        },
        settings: {
            id: 'default',
            pointsEnabled: true,
            pointsStartAt: new Date('2026-08-01T00:00:00.000Z'),
            managerOwnedUserPointsEnabled: false,
            operationSpendSnapshotCutoverAt: new Date('2026-08-06T09:00:00.000Z'),
        },
        rules: [
            {
                id: 'rule-user',
                ownerType: 'USER_GLOBAL',
                ownerUserId: null,
                pointsPerThousand: 4,
                updatedAt: completedAt,
            },
            {
                id: 'rule-agent',
                ownerType: 'AGENT_DEFAULT',
                ownerUserId: null,
                pointsPerThousand: 2,
                updatedAt: completedAt,
            },
        ],
        run: null as null | Record<string, unknown>,
        ledgerEntries: [] as Array<Record<string, unknown>>,
        failLedgerInsert: false,
        onOwnerLock: null as null | (() => void),
        pendingSettingsWrite: null as null | (() => void),
        settingsLocked: false,
        hiddenRunReads: 0,
        settingsReads: 0,
        ruleReads: 0,
    }
}

function queryText(query: unknown): string {
    if (query && typeof query === 'object' && 'strings' in query) {
        return (query as { strings: string[] }).strings.join(' ')
    }
    return String(query)
}

function createMemoryTransaction(state: MemoryState) {
    return {
        $queryRaw: async (query: unknown) => {
            const sql = queryText(query)
            if (sql.includes('operation_spend_award_runs')) {
                return state.run ? [{ id: state.run.id }] : []
            }
            if (sql.includes('point_program_settings')) {
                if (state.pendingSettingsWrite) {
                    const mutation = state.pendingSettingsWrite
                    state.pendingSettingsWrite = null
                    mutation()
                }
                state.settingsLocked = true
                return [{ id: 'default' }]
            }
            if (sql.includes('operations')) return state.operation ? [{ id: state.operation.id }] : []
            if (sql.includes('users')) {
                const values = query && typeof query === 'object' && 'values' in query
                    ? (query as { values: unknown[] }).values
                    : []
                if (values.includes('agent-1') && state.onOwnerLock) {
                    const mutation = state.onOwnerLock
                    state.onOwnerLock = null
                    mutation()
                }
                return values.filter((value): value is string => typeof value === 'string')
                    .map((id) => ({ id }))
            }
            return []
        },
        operation: {
            findUnique: async () => structuredClone(state.operation),
        },
        pointProgramSettings: {
            findUnique: async () => {
                state.settingsReads += 1
                const observed = structuredClone(state.settings)
                if (!state.settingsLocked && state.pendingSettingsWrite) {
                    const mutation = state.pendingSettingsWrite
                    state.pendingSettingsWrite = null
                    mutation()
                }
                return observed
            },
        },
        pointRule: {
            findMany: async () => {
                state.ruleReads += 1
                return state.rules
            },
        },
        operationSpendAwardRun: {
            findUnique: async () => {
                if (state.hiddenRunReads > 0) {
                    state.hiddenRunReads -= 1
                    return null
                }
                return state.run
            },
            create: async ({ data }: { data: Record<string, unknown> }) => {
                if (state.run) throw new Error('unique operation award-run conflict')
                state.run = {
                    id: 'run-1',
                    ledgerEntryCount: 0,
                    finalizationAttemptCount: 0,
                    lastFinalizationAttemptAt: null,
                    nextFinalizationAttemptAt: null,
                    lastFinalizationErrorCode: null,
                    finalizedAt: null,
                    ownershipEvidenceSnapshot: null,
                    recipientsSnapshot: null,
                    ...data,
                }
                return state.run
            },
            upsert: async ({ create }: { create: Record<string, unknown> }) => {
                if (state.run) return state.run
                state.run = {
                    id: 'run-1',
                    ledgerEntryCount: 0,
                    finalizationAttemptCount: 0,
                    lastFinalizationAttemptAt: null,
                    nextFinalizationAttemptAt: null,
                    lastFinalizationErrorCode: null,
                    finalizedAt: null,
                    ownershipEvidenceSnapshot: null,
                    recipientsSnapshot: null,
                    ...create,
                }
                return state.run
            },
            update: async ({ data }: { data: Record<string, unknown> }) => {
                assert.ok(state.run)
                state.run = { ...state.run, ...data }
                return state.run
            },
            updateMany: async ({
                where,
                data,
            }: {
                where: { id: string; status: string; finalizationAttemptCount: number }
                data: Record<string, unknown>
            }) => {
                if (!state.run
                    || state.run.id !== where.id
                    || state.run.status !== where.status
                    || state.run.finalizationAttemptCount !== where.finalizationAttemptCount) {
                    return { count: 0 }
                }
                state.run = { ...state.run, ...data }
                return { count: 1 }
            },
        },
        pointLedgerEntry: {
            findFirst: async () => state.ledgerEntries.find((entry) => (
                entry.sourceType === 'OPERATION_SPEND'
                && entry.sourceId === state.operation.id
                && entry.operationSpendAwardRunId == null
            )) ?? null,
            count: async ({ where }: { where: { operationSpendAwardRunId: string } }) => (
                state.ledgerEntries.filter((entry) => (
                    entry.operationSpendAwardRunId === where.operationSpendAwardRunId
                )).length
            ),
            createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
                if (state.failLedgerInsert) {
                    state.ledgerEntries.push(data[0])
                    throw new Error('injected second recipient failure')
                }
                state.ledgerEntries.push(...data)
                return { count: data.length }
            },
        },
    }
}

function createMemoryDatabase(state = initialState()) {
    return {
        state,
        $transaction: async <T>(work: (transaction: ReturnType<typeof createMemoryTransaction>) => Promise<T>) => {
            const workingState = structuredClone(state)
            const outcome = await work(createMemoryTransaction(workingState))
            Object.assign(state, workingState)
            return outcome
        },
    }
}

test('capture stores one completion-time owner and rate snapshot in the caller transaction', async () => {
    const database = createMemoryDatabase()

    const capture = await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(database.state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )

    assert.deepEqual(capture, {
        operationId: 'operation-1',
        runId: 'run-1',
        outcome: 'CREATED',
        status: 'CAPTURED',
        reasonCode: null,
    })
    assert.deepEqual((database.state.run?.recipientsSnapshot as Array<Record<string, unknown>>).map((recipient) => ({
        ownerUserId: recipient.ownerUserId,
        ratePerThousand: recipient.ratePerThousand,
        points: recipient.points,
    })), [
        { ownerUserId: 'agent-1', ratePerThousand: 2, points: 2 },
        { ownerUserId: 'user-1', ratePerThousand: 4, points: 4 },
    ])
})

test('capture is idempotent only for an exact immutable identity match', async () => {
    const database = createMemoryDatabase()
    const transaction = createMemoryTransaction(database.state) as never
    const completedAt = new Date('2026-08-06T10:00:00.000Z')

    await captureOperationSpendAwardRunInTransaction(
        transaction,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        completedAt
    )
    const repeated = await captureOperationSpendAwardRunInTransaction(
        transaction,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        completedAt
    )
    const conflict = await captureOperationSpendAwardRunInTransaction(
        transaction,
        'operation-1',
        'WEB_RECOVERY',
        completedAt
    )

    assert.equal(repeated.outcome, 'ALREADY_EXISTS')
    assert.equal(repeated.runId, 'run-1')
    assert.deepEqual(conflict, {
        operationId: 'operation-1',
        runId: 'run-1',
        outcome: 'CONFLICT',
        status: 'CAPTURED',
        reasonCode: 'AWARD_RUN_CONFLICT',
    })
})

test('customer-only Worker completion sources capture one evidence-free idempotent skip', async () => {
    const completionSources = [
        'WORKER_RENEWAL',
        'WORKER_SIGNAL_REFRESH',
        'WORKER_SIGNAL_CHECK',
    ]

    for (const completionSource of completionSources) {
        const state = initialState()
        Object.assign(state.operation, {
            customerId: 'customer-1',
            userId: null,
            user: null,
        })
        const transaction = createMemoryTransaction(state) as never

        const created = await captureOperationSpendAwardRunInTransaction(
            transaction,
            'operation-1',
            completionSource,
            state.operation.completedAt
        )
        const repeated = await captureOperationSpendAwardRunInTransaction(
            transaction,
            'operation-1',
            completionSource,
            state.operation.completedAt
        )
        const conflicting = await captureOperationSpendAwardRunInTransaction(
            transaction,
            'operation-1',
            `${completionSource}_DIFFERENT`,
            state.operation.completedAt
        )

        assert.equal(created.status, 'SKIPPED', completionSource)
        assert.equal(created.reasonCode, 'CUSTOMER_OPERATION_NOT_ELIGIBLE', completionSource)
        assert.equal(repeated.outcome, 'ALREADY_EXISTS', completionSource)
        assert.equal(repeated.runId, created.runId, completionSource)
        assert.equal(conflicting.outcome, 'CONFLICT', completionSource)
        assert.equal(conflicting.reasonCode, 'AWARD_RUN_CONFLICT', completionSource)
        assert.equal(state.run?.operationUserIdSnapshot, null, completionSource)
        assert.equal(state.run?.ownershipKindSnapshot, null, completionSource)
        assert.equal(state.run?.ownershipOwnerIdSnapshot, null, completionSource)
        assert.equal(state.run?.pointsEnabledSnapshot, null, completionSource)
        assert.equal(state.run?.pointsStartAtSnapshot, null, completionSource)
        assert.equal(state.run?.managerOwnedUserPointsEnabledSnapshot, null, completionSource)
        assert.equal(state.run?.ownershipEvidenceSnapshot, null, completionSource)
        assert.equal(state.run?.recipientsSnapshot, null, completionSource)
        assert.equal(state.settingsReads, 0, completionSource)
        assert.equal(state.ruleReads, 0, completionSource)
    }
})

test('every immutable operation identity field participates in conflict detection', async () => {
    const cases: Array<{
        name: string
        mutate: (state: MemoryState) => void
    }> = [
        {
            name: 'user id',
            mutate: (state) => {
                state.operation.userId = 'user-2'
                state.operation.user.id = 'user-2'
            },
        },
        {
            name: 'completion timestamp',
            mutate: (state) => {
                state.operation.completedAt = new Date('2026-08-06T10:00:01.000Z')
            },
        },
        {
            name: 'operation type',
            mutate: (state) => {
                state.operation.type = 'CHECK_BALANCE'
            },
        },
        {
            name: 'amount',
            mutate: (state) => {
                state.operation.amount = 1001
            },
        },
    ]

    for (const identityCase of cases) {
        const state = initialState()
        const transaction = createMemoryTransaction(state) as never
        await captureOperationSpendAwardRunInTransaction(
            transaction,
            'operation-1',
            'WORKER_CONFIRM_PURCHASE',
            state.operation.completedAt
        )
        identityCase.mutate(state)

        const result = await captureOperationSpendAwardRunInTransaction(
            transaction,
            'operation-1',
            'WORKER_CONFIRM_PURCHASE',
            state.operation.completedAt
        )

        assert.equal(result.outcome, 'CONFLICT', identityCase.name)
        assert.equal(result.reasonCode, 'AWARD_RUN_CONFLICT', identityCase.name)
    }
})

test('capture re-reads owner state after waiting for lexical owner locks', async () => {
    const state = initialState()
    state.onOwnerLock = () => {
        state.operation.user.agentAssignmentAsUser[0].agent.isActive = false
    }

    const capture = await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )

    assert.equal(capture.status, 'SKIPPED')
    assert.equal(capture.reasonCode, 'UNOWNED')
    assert.equal(state.run?.ownershipOwnerIdSnapshot, null)
    assert.deepEqual(state.run?.recipientsSnapshot, [])
})

test('capture locks point settings before reading settings and rates', async () => {
    const state = initialState()
    state.pendingSettingsWrite = () => {
        state.settings.pointsEnabled = false
        state.rules[0].pointsPerThousand = 99
        state.rules[1].pointsPerThousand = 99
    }

    const capture = await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )

    assert.equal(capture.status, 'SKIPPED')
    assert.equal(capture.reasonCode, 'POINTS_DISABLED')
    assert.equal(state.run?.pointsEnabledSnapshot, false)
    assert.deepEqual(state.run?.recipientsSnapshot, [])
})

test('finalization uses only captured recipients after ownership and rates change', async () => {
    const database = createMemoryDatabase()
    await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(database.state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )
    database.state.operation.user.agentAssignmentAsUser[0].agentId = 'agent-2'
    database.state.operation.user.agentAssignmentAsUser[0].agent.id = 'agent-2'
    database.state.rules[0].pointsPerThousand = 99
    database.state.rules[1].pointsPerThousand = 99

    const finalized = await finalizeOperationSpendAwardRun('operation-1', database as never)

    assert.deepEqual(finalized, {
        operationId: 'operation-1',
        runId: 'run-1',
        outcome: 'AWARDED',
        ledgerEntryCount: 2,
        reasonCode: null,
    })
    assert.deepEqual(database.state.ledgerEntries.map((entry) => ({
        ownerUserId: entry.ownerUserId,
        ratePerThousandSnapshot: entry.ratePerThousandSnapshot,
        points: entry.points,
    })), [
        { ownerUserId: 'agent-1', ratePerThousandSnapshot: 2, points: 2 },
        { ownerUserId: 'user-1', ratePerThousandSnapshot: 4, points: 4 },
    ])
})

test('recipient insertion failure rolls back the whole finalization transaction', async () => {
    const database = createMemoryDatabase()
    await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(database.state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )
    database.state.failLedgerInsert = true

    await assert.rejects(
        finalizeOperationSpendAwardRun('operation-1', database as never),
        /injected second recipient failure/
    )
    assert.equal(database.state.run?.status, 'CAPTURED')
    assert.equal(database.state.run?.finalizationAttemptCount, 1)
    assert.equal(database.state.run?.lastFinalizationErrorCode, OPERATION_SPEND_FINALIZATION_ERROR_CODE)
    assert.ok(database.state.run?.nextFinalizationAttemptAt instanceof Date)
    assert.deepEqual(database.state.ledgerEntries, [])
})

test('failed finalization backoff is bounded and exhaustion requires manual review', () => {
    const attemptedAt = new Date('2026-08-06T10:00:00.000Z')
    const firstFailure = resolveOperationSpendFinalizationFailure({
        currentAttemptCount: 0,
        attemptedAt,
    })
    const exhaustedFailure = resolveOperationSpendFinalizationFailure({
        currentAttemptCount: OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS - 1,
        attemptedAt,
    })

    assert.deepEqual(firstFailure, {
        finalizationAttemptCount: 1,
        lastFinalizationAttemptAt: attemptedAt,
        nextFinalizationAttemptAt: new Date('2026-08-06T10:05:00.000Z'),
        lastFinalizationErrorCode: OPERATION_SPEND_FINALIZATION_ERROR_CODE,
        status: 'CAPTURED',
        reasonCode: null,
    })
    assert.equal(exhaustedFailure.finalizationAttemptCount, OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS)
    assert.equal(exhaustedFailure.status, 'LEGACY_REVIEW_REQUIRED')
    assert.equal(exhaustedFailure.reasonCode, OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON)
    assert.equal(exhaustedFailure.nextFinalizationAttemptAt, null)
})

test('repeated finalization failures persist only a safe code and stop at the attempt limit', async () => {
    const database = createMemoryDatabase()
    await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(database.state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )
    database.state.failLedgerInsert = true

    for (let attempt = 0; attempt < OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS; attempt++) {
        await assert.rejects(
            finalizeOperationSpendAwardRun('operation-1', database as never),
            /injected second recipient failure/
        )
    }

    assert.equal(database.state.run?.status, 'LEGACY_REVIEW_REQUIRED')
    assert.equal(database.state.run?.reasonCode, OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON)
    assert.equal(database.state.run?.lastFinalizationErrorCode, OPERATION_SPEND_FINALIZATION_ERROR_CODE)
    assert.equal(database.state.run?.nextFinalizationAttemptAt, null)
    assert.doesNotMatch(
        String(database.state.run?.lastFinalizationErrorCode),
        /injected|recipient/i
    )
    assert.deepEqual(database.state.ledgerEntries, [])
})

test('unlinked operation-spend history blocks captured-run finalization', async () => {
    const database = createMemoryDatabase()
    await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(database.state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )
    database.state.ledgerEntries.push({
        id: 'legacy-entry',
        sourceType: 'OPERATION_SPEND',
        sourceId: 'operation-1',
        operationSpendAwardRunId: null,
    })

    const finalized = await finalizeOperationSpendAwardRun('operation-1', database as never)

    assert.equal(finalized.outcome, 'REVIEW_REQUIRED')
    assert.equal(finalized.reasonCode, 'UNLINKED_OPERATION_SPEND_LEDGER')
    assert.equal(database.state.run?.status, 'LEGACY_REVIEW_REQUIRED')
    assert.equal(database.state.ledgerEntries.length, 1)
})

test('post-cutover missing run creates one idempotent review sentinel', async () => {
    const database = createMemoryDatabase()

    const first = await finalizeOperationSpendAwardRun('operation-1', database as never)
    database.state.hiddenRunReads = 1
    const second = await finalizeOperationSpendAwardRun('operation-1', database as never)

    assert.equal(first.outcome, 'REVIEW_REQUIRED')
    assert.equal(first.reasonCode, 'POST_CUTOVER_MISSING_RUN')
    assert.equal(first.runId, 'run-1')
    assert.deepEqual(second, first)
    assert.equal(database.state.run?.status, 'LEGACY_REVIEW_REQUIRED')
    assert.equal(database.state.run?.ownershipEvidenceSnapshot, null)
    assert.equal(database.state.run?.recipientsSnapshot, null)
})

test('a raced sentinel with mismatched immutable identity becomes a safe review conflict', async () => {
    const database = createMemoryDatabase()
    await finalizeOperationSpendAwardRun('operation-1', database as never)
    assert.ok(database.state.run)
    database.state.run.amountUsdSnapshot = 999
    database.state.hiddenRunReads = 1

    const result = await finalizeOperationSpendAwardRun('operation-1', database as never)

    assert.equal(result.outcome, 'REVIEW_REQUIRED')
    assert.equal(result.reasonCode, 'AWARD_RUN_CONFLICT')
    assert.equal(database.state.run.status, 'LEGACY_REVIEW_REQUIRED')
    assert.equal(database.state.run.amountUsdSnapshot, 999)
})

test('pre-cutover missing run stays untouched and returns not found', async () => {
    const database = createMemoryDatabase()
    database.state.settings.operationSpendSnapshotCutoverAt = new Date('2026-08-07T00:00:00.000Z')

    const finalized = await finalizeOperationSpendAwardRun('operation-1', database as never)

    assert.deepEqual(finalized, {
        operationId: 'operation-1',
        runId: null,
        outcome: 'NOT_FOUND',
        ledgerEntryCount: 0,
        reasonCode: 'PRE_CUTOVER_MISSING_RUN',
    })
    assert.equal(database.state.run, null)
})

test('skipped run finalization is an idempotent no-op', async () => {
    const database = createMemoryDatabase()
    database.state.settings.pointsEnabled = false
    const capture = await captureOperationSpendAwardRunInTransaction(
        createMemoryTransaction(database.state) as never,
        'operation-1',
        'WORKER_CONFIRM_PURCHASE',
        new Date('2026-08-06T10:00:00.000Z')
    )

    const finalized = await finalizeOperationSpendAwardRun('operation-1', database as never)

    assert.equal(capture.status, 'SKIPPED')
    assert.deepEqual(finalized, {
        operationId: 'operation-1',
        runId: 'run-1',
        outcome: 'SKIPPED',
        ledgerEntryCount: 0,
        reasonCode: 'POINTS_DISABLED',
    })
    assert.deepEqual(database.state.ledgerEntries, [])
})
