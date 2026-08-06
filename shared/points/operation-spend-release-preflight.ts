export const OPERATION_SPEND_RELEASE_SAMPLE_LIMIT = 100
const STALE_CAPTURED_AGE_MS = 5 * 60_000

const RUN_STATUSES = [
    'CAPTURED',
    'AWARDED',
    'SKIPPED',
    'LEGACY_REVIEW_REQUIRED',
] as const

type RunStatus = typeof RUN_STATUSES[number]
type RunIdRow = { id: string; operationId: string }
type LedgerIdRow = { id: string; operationId: string | null }
type RunGroupRow = { status: RunStatus; _count: { _all: number } }

export type OperationSpendReleaseBlocker =
    | 'STALE_CAPTURED_RUNS'
    | 'FINALIZATION_RETRIES_EXHAUSTED'
    | 'POST_CUTOVER_MISSING_RUNS'
    | 'POST_CUTOVER_UNLINKED_LEDGER'

export type OperationSpendReleasePreflightDb = {
    pointProgramSettings: {
        findUnique(args: unknown): Promise<{ operationSpendSnapshotCutoverAt: Date | null } | null>
    }
    operationSpendAwardRun: {
        groupBy(args: unknown): Promise<RunGroupRow[]>
        count(args: unknown): Promise<number>
        findMany(args: unknown): Promise<RunIdRow[]>
    }
    pointLedgerEntry: {
        count(args: unknown): Promise<number>
        findMany(args: unknown): Promise<LedgerIdRow[]>
    }
    operation: {
        count(args: unknown): Promise<number>
        findMany(args: unknown): Promise<Array<{ id: string }>>
    }
}

export type SafeRunSummary = {
    count: number
    runIds: string[]
    operationIds: string[]
}

export type SafeLedgerSummary = {
    count: number
    entries: LedgerIdRow[]
}

export type OperationSpendReleasePreflight = {
    readOnly: true
    checkedAt: string
    cutoverAt: string | null
    sampleLimit: number
    runStates: Record<RunStatus, SafeRunSummary>
    staleCapturedRuns: SafeRunSummary
    retryExhaustedRuns: SafeRunSummary
    postCutoverMissingRuns: { count: number; operationIds: string[] }
    unlinkedOperationSpendLedger: SafeLedgerSummary
    postCutoverUnlinkedLedger: SafeLedgerSummary
    activation: { ready: boolean; blockers: OperationSpendReleaseBlocker[] }
}

function safeRunSummary(count: number, rows: RunIdRow[]): SafeRunSummary {
    return {
        count,
        runIds: rows.map((row) => row.id),
        operationIds: rows.map((row) => row.operationId),
    }
}

async function summarizeRunStates(
    db: OperationSpendReleasePreflightDb,
    limit: number,
): Promise<Record<RunStatus, SafeRunSummary>> {
    const [groups, ...samples] = await Promise.all([
        db.operationSpendAwardRun.groupBy({ by: ['status'], _count: { _all: true } }),
        ...RUN_STATUSES.map((status) => db.operationSpendAwardRun.findMany({
            where: { status },
            orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
            take: limit,
            select: { id: true, operationId: true },
        })),
    ])
    const counts = new Map(groups.map((group) => [group.status, group._count._all]))
    return Object.fromEntries(RUN_STATUSES.map((status, index) => [
        status,
        safeRunSummary(counts.get(status) ?? 0, samples[index]),
    ])) as Record<RunStatus, SafeRunSummary>
}

async function summarizeRuns(
    db: OperationSpendReleasePreflightDb,
    where: unknown,
    limit: number,
): Promise<SafeRunSummary> {
    const [count, rows] = await Promise.all([
        db.operationSpendAwardRun.count({ where }),
        db.operationSpendAwardRun.findMany({
            where,
            orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
            take: limit,
            select: { id: true, operationId: true },
        }),
    ])
    return safeRunSummary(count, rows)
}

async function summarizeLedger(
    db: OperationSpendReleasePreflightDb,
    where: unknown,
    limit: number,
): Promise<SafeLedgerSummary> {
    const [count, entries] = await Promise.all([
        db.pointLedgerEntry.count({ where }),
        db.pointLedgerEntry.findMany({
            where,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: limit,
            select: { id: true, operationId: true },
        }),
    ])
    return { count, entries }
}

async function summarizeMissingRuns(
    db: OperationSpendReleasePreflightDb,
    cutoverAt: Date | null,
    limit: number,
) {
    if (!cutoverAt) return { count: 0, operationIds: [] }
    const where = {
        status: 'COMPLETED',
        completedAt: { gte: cutoverAt },
        operationSpendAwardRun: null,
    }
    const [count, rows] = await Promise.all([
        db.operation.count({ where }),
        db.operation.findMany({
            where,
            orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
            take: limit,
            select: { id: true },
        }),
    ])
    return { count, operationIds: rows.map((row) => row.id) }
}

function activationBlockers(input: {
    staleCapturedRuns: SafeRunSummary
    retryExhaustedRuns: SafeRunSummary
    postCutoverMissingRuns: { count: number }
    postCutoverUnlinkedLedger: SafeLedgerSummary
}): OperationSpendReleaseBlocker[] {
    const blockers: OperationSpendReleaseBlocker[] = []
    if (input.staleCapturedRuns.count > 0) blockers.push('STALE_CAPTURED_RUNS')
    if (input.retryExhaustedRuns.count > 0) blockers.push('FINALIZATION_RETRIES_EXHAUSTED')
    if (input.postCutoverMissingRuns.count > 0) blockers.push('POST_CUTOVER_MISSING_RUNS')
    if (input.postCutoverUnlinkedLedger.count > 0) blockers.push('POST_CUTOVER_UNLINKED_LEDGER')
    return blockers
}

export async function buildOperationSpendReleasePreflight(input: {
    db: OperationSpendReleasePreflightDb
    now: Date
    sampleLimit?: number
}): Promise<OperationSpendReleasePreflight> {
    const sampleLimit = input.sampleLimit ?? OPERATION_SPEND_RELEASE_SAMPLE_LIMIT
    if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 1_000) {
        throw new Error('INVALID_SAMPLE_LIMIT')
    }
    const settings = await input.db.pointProgramSettings.findUnique({
        where: { id: 'default' },
        select: { operationSpendSnapshotCutoverAt: true },
    })
    const cutoverAt = settings?.operationSpendSnapshotCutoverAt ?? null
    const staleBefore = new Date(input.now.getTime() - STALE_CAPTURED_AGE_MS)
    const baseUnlinkedWhere = {
        sourceType: 'OPERATION_SPEND',
        operationSpendAwardRunId: null,
    }
    const postCutoverUnlinkedWhere = cutoverAt ? {
        ...baseUnlinkedWhere,
        createdAt: { gte: cutoverAt },
    } : null
    const [runStates, staleCapturedRuns, retryExhaustedRuns, postCutoverMissingRuns,
        unlinkedOperationSpendLedger, postCutoverUnlinkedLedger] = await Promise.all([
        summarizeRunStates(input.db, sampleLimit),
        summarizeRuns(input.db, { status: 'CAPTURED', capturedAt: { lte: staleBefore } }, sampleLimit),
        summarizeRuns(input.db, {
            OR: [
                {
                    status: 'LEGACY_REVIEW_REQUIRED',
                    reasonCode: OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON,
                },
                {
                    status: 'CAPTURED',
                    finalizationAttemptCount: {
                        gte: OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS,
                    },
                },
            ],
        }, sampleLimit),
        summarizeMissingRuns(input.db, cutoverAt, sampleLimit),
        summarizeLedger(input.db, baseUnlinkedWhere, sampleLimit),
        postCutoverUnlinkedWhere
            ? summarizeLedger(input.db, postCutoverUnlinkedWhere, sampleLimit)
            : Promise.resolve({ count: 0, entries: [] }),
    ])
    const blockers = activationBlockers({
        staleCapturedRuns,
        retryExhaustedRuns,
        postCutoverMissingRuns,
        postCutoverUnlinkedLedger,
    })
    return {
        readOnly: true,
        checkedAt: input.now.toISOString(),
        cutoverAt: cutoverAt?.toISOString() ?? null,
        sampleLimit,
        runStates,
        staleCapturedRuns,
        retryExhaustedRuns,
        postCutoverMissingRuns,
        unlinkedOperationSpendLedger,
        postCutoverUnlinkedLedger,
        activation: { ready: blockers.length === 0, blockers },
    }
}
import {
    OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON,
    OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS,
} from './operation-spend-award-runs'
