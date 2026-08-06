import prisma from '@/lib/prisma'
import {
    finalizeOperationSpendAwardRun,
    OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON,
    OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS,
    type OperationSpendFinalizationOutcome,
} from '@/lib/points/operation-spend-award-runs'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const DEFAULT_STALE_MS = 5 * 60 * 1000
const MIN_STALE_MS = 60 * 1000

export type OperationSpendAwardRunMaintenanceSummary = {
    inspected: number
    awarded: number
    alreadyFinalized: number
    skipped: number
    reviewRequired: number
    notFound: number
    retryScheduled: number
    retryExhausted: number
    errors: string[]
}

type MaintenanceBoundsInput = {
    now: Date
    limit?: number
    staleMs?: number
}

type MaintenanceBounds = {
    limit: number
    staleBefore: Date
}

type EligibleCapturedRun = {
    id: string
    operationId: string
    finalizationAttemptCount: number
}

function positiveInteger(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) && value !== undefined && value > 0
        ? Math.trunc(value)
        : fallback
}

export function resolveOperationSpendAwardRunMaintenanceBounds(
    boundsInput: MaintenanceBoundsInput
): MaintenanceBounds {
    const limit = Math.min(positiveInteger(boundsInput.limit, DEFAULT_LIMIT), MAX_LIMIT)
    const staleMs = Math.max(positiveInteger(boundsInput.staleMs, DEFAULT_STALE_MS), MIN_STALE_MS)
    return {
        limit,
        staleBefore: new Date(boundsInput.now.getTime() - staleMs),
    }
}

function emptySummary(inspected: number): OperationSpendAwardRunMaintenanceSummary {
    return {
        inspected,
        awarded: 0,
        alreadyFinalized: 0,
        skipped: 0,
        reviewRequired: 0,
        notFound: 0,
        retryScheduled: 0,
        retryExhausted: 0,
        errors: [],
    }
}

function recordOutcome(
    summary: OperationSpendAwardRunMaintenanceSummary,
    outcome: OperationSpendFinalizationOutcome
): void {
    if (outcome === 'AWARDED') summary.awarded++
    if (outcome === 'ALREADY_FINALIZED') summary.alreadyFinalized++
    if (outcome === 'SKIPPED') summary.skipped++
    if (outcome === 'REVIEW_REQUIRED') summary.reviewRequired++
    if (outcome === 'NOT_FOUND') summary.notFound++
}

async function findEligibleCapturedRuns(
    bounds: MaintenanceBounds,
    now: Date
): Promise<EligibleCapturedRun[]> {
    const { limit, staleBefore } = bounds
    return prisma.operationSpendAwardRun.findMany({
        where: {
            status: 'CAPTURED',
            capturedAt: { lte: staleBefore },
            OR: [
                { nextFinalizationAttemptAt: null },
                { nextFinalizationAttemptAt: { lte: now } },
            ],
        },
        select: { id: true, operationId: true, finalizationAttemptCount: true },
        orderBy: [
            { nextFinalizationAttemptAt: 'asc' },
            { capturedAt: 'asc' },
            { operationId: 'asc' },
        ],
        take: limit,
    })
}

async function exhaustCapturedRun(run: EligibleCapturedRun): Promise<boolean> {
    const update = await prisma.operationSpendAwardRun.updateMany({
        where: {
            id: run.id,
            status: 'CAPTURED',
            finalizationAttemptCount: run.finalizationAttemptCount,
        },
        data: {
            status: 'LEGACY_REVIEW_REQUIRED',
            reasonCode: OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON,
            nextFinalizationAttemptAt: null,
        },
    })
    return update.count === 1
}

async function recordPersistedFailure(
    summary: OperationSpendAwardRunMaintenanceSummary,
    selectedRun: EligibleCapturedRun
): Promise<void> {
    const run = await prisma.operationSpendAwardRun.findUnique({
        where: { operationId: selectedRun.operationId },
        select: {
            status: true,
            reasonCode: true,
            finalizationAttemptCount: true,
            nextFinalizationAttemptAt: true,
        },
    })
    if (!run || run.finalizationAttemptCount <= selectedRun.finalizationAttemptCount) return
    if (run.status === 'LEGACY_REVIEW_REQUIRED'
        && run.reasonCode === OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON) {
        summary.retryExhausted++
        summary.reviewRequired++
    } else if (run.status === 'CAPTURED' && run.nextFinalizationAttemptAt) {
        summary.retryScheduled++
    }
}

export async function retryStaleCapturedOperationSpendAwardRuns(
    maintenanceInput: MaintenanceBoundsInput
): Promise<OperationSpendAwardRunMaintenanceSummary> {
    const bounds = resolveOperationSpendAwardRunMaintenanceBounds(maintenanceInput)
    const runs = await findEligibleCapturedRuns(bounds, maintenanceInput.now)
    const summary = emptySummary(runs.length)

    for (const run of runs) {
        if (run.finalizationAttemptCount >= OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS) {
            if (await exhaustCapturedRun(run)) {
                summary.retryExhausted++
                summary.reviewRequired++
                summary.errors.push(run.operationId)
            }
            continue
        }
        try {
            const finalization = await finalizeOperationSpendAwardRun(run.operationId)
            recordOutcome(summary, finalization.outcome)
        } catch {
            console.error(`[Maintenance] Failed to finalize award run for operation ${run.operationId}`)
            summary.errors.push(run.operationId)
            try {
                await recordPersistedFailure(summary, run)
            } catch {
                console.error(`[Maintenance] Failed to read retry state for operation ${run.operationId}`)
            }
        }
    }

    return summary
}
