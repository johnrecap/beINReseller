import crypto from 'node:crypto'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { recoverOperationIfNeeded } from '@/lib/operations/recovery'
import { runDispatchWatchdog } from '@/lib/operation-dispatch'
import { repairCompletionEffects } from '@/lib/maintenance/completion-effect-maintenance'
import {
    retryStaleCapturedOperationSpendAwardRuns,
    type OperationSpendAwardRunMaintenanceSummary,
} from '@/lib/maintenance/operation-spend-award-run-maintenance'
import {
    repairDueRenewalVerificationJobs,
    type RenewalVerificationJobMaintenanceSummary,
} from '@/lib/maintenance/renewal-fulfillment-verification-maintenance'

const LEADER_LOCK_KEY = 'operation-maintenance:leader'
export const MAINTENANCE_HEALTH_KEY = 'operation-maintenance:health'

type MaintenanceStatus = 'healthy' | 'degraded' | 'error' | 'idle'

export interface MaintenanceCycleSummary {
    cycleId: string
    status: MaintenanceStatus
    startedAt: string
    finishedAt: string
    durationMs: number
    inspected: number
    changed: number
    skipped: number
    retried: number
    reviewRequired: number
    refunded: number
    awardRuns: OperationSpendAwardRunMaintenanceSummary
    verificationJobs: RenewalVerificationJobMaintenanceSummary
    completionEffects: Awaited<ReturnType<typeof repairCompletionEffects>> | null
    errors: string[]
}

export interface OperationMaintenanceRunnerOptions {
    intervalMs?: number
    leaderTtlMs?: number
    staleLimit?: number
    maxDispatchAttempts?: number
    awardRunLimit?: number
    awardRunStaleMs?: number
    verificationJobLimit?: number
    once?: boolean
}

function envNumber(name: string, fallback: number): number {
    const value = Number(process.env[name])
    return Number.isFinite(value) && value > 0 ? value : fallback
}

async function acquireLeaderLock(token: string, ttlMs: number): Promise<boolean> {
    const result = await redis.set(LEADER_LOCK_KEY, token, 'PX', ttlMs, 'NX')
    return result === 'OK'
}

async function releaseLeaderLock(token: string) {
    await redis.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        1, LEADER_LOCK_KEY, token)
}

function boundedBatch(value: number): number {
    return Number.isFinite(value) ? Math.max(1, Math.min(200, Math.floor(value))) : 50
}

async function saveHealth(summary: MaintenanceCycleSummary) {
    await redis.set(MAINTENANCE_HEALTH_KEY, JSON.stringify(summary), 'EX', 300)
}

async function findRecoverableOperationIds(now: Date, limit: number): Promise<string[]> {
    const completingCutoff = new Date(now.getTime() - 2 * 60 * 1000)
    const processingCutoff = new Date(now.getTime() - 5 * 60 * 1000)
    const awaitingPackageCutoff = new Date(now.getTime() - 15 * 60 * 1000)

    const operations = await prisma.operation.findMany({
        where: {
            OR: [
                {
                    status: 'PROCESSING',
                    updatedAt: { lt: processingCutoff },
                },
                {
                    status: 'AWAITING_PACKAGE',
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                        { updatedAt: { lt: awaitingPackageCutoff } },
                    ],
                },
                {
                    status: 'AWAITING_FINAL_CONFIRM',
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                    ],
                },
                {
                    status: 'COMPLETING',
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                        { updatedAt: { lt: completingCutoff } },
                    ],
                },
            ],
        },
        select: { id: true },
        orderBy: { updatedAt: 'asc' },
        take: limit,
    })

    return operations.map(operation => operation.id)
}

export async function runOperationMaintenanceCycle(
    options?: Pick<
        OperationMaintenanceRunnerOptions,
        'staleLimit' | 'maxDispatchAttempts' | 'awardRunLimit' | 'awardRunStaleMs' | 'verificationJobLimit'
    >
): Promise<MaintenanceCycleSummary> {
    const started = new Date()
    const cycleId = crypto.randomUUID()
    const staleLimit = boundedBatch(options?.staleLimit ?? envNumber('MAINTENANCE_STALE_LIMIT', 50))
    const maxDispatchAttempts = options?.maxDispatchAttempts ?? envNumber('MAINTENANCE_MAX_DISPATCH_ATTEMPTS', 5)
    const awardRunLimit = boundedBatch(options?.awardRunLimit ?? envNumber('MAINTENANCE_AWARD_RUN_LIMIT', 50))
    const awardRunStaleMs = options?.awardRunStaleMs ?? envNumber('MAINTENANCE_AWARD_RUN_STALE_MS', 300000)
    const verificationJobLimit = boundedBatch(options?.verificationJobLimit ?? envNumber('MAINTENANCE_VERIFICATION_JOB_LIMIT', 50))

    let inspected = 0
    let changed = 0
    let skipped = 0
    let retried = 0
    let reviewRequired = 0
    let refunded = 0
    let awardRuns: OperationSpendAwardRunMaintenanceSummary = {
        inspected: 0,
        awarded: 0,
        alreadyFinalized: 0,
        skipped: 0,
        reviewRequired: 0,
        notFound: 0,
        retryScheduled: 0,
        retryExhausted: 0,
        errors: [],
    }
    let verificationJobs: RenewalVerificationJobMaintenanceSummary = {
        inspected: 0,
        enqueued: 0,
        alreadyQueued: 0,
        replacedTerminalJob: 0,
        errors: [],
    }
    const errors: string[] = []
    let completionEffects: Awaited<ReturnType<typeof repairCompletionEffects>> | null = null

    try {
        const dispatch = await runDispatchWatchdog({
            maxAttempts: maxDispatchAttempts,
            limit: staleLimit,
        })
        inspected += dispatch.scanned
        changed += dispatch.recovered
        skipped += dispatch.skipped
        retried += dispatch.retried
        reviewRequired += dispatch.review
        refunded += dispatch.refunded
        errors.push(...dispatch.errors)

        const operationIds = await findRecoverableOperationIds(started, staleLimit)
        inspected += operationIds.length

        for (const operationId of operationIds) {
            try {
                const result = await recoverOperationIfNeeded(operationId, 'maintenance', { now: started })
                if (result.changed) changed++
                if (result.skipped || !result.changed) skipped++
                if (result.decision === 'RETRY_DISPATCH') retried++
                if (result.reviewRequired) reviewRequired++
                if (result.refundApplied) refunded++
            } catch {
                console.error(`[Maintenance] Failed to recover operation ${operationId}`)
                errors.push(operationId)
            }
        }
    } catch {
        console.error('[Maintenance] Cycle failed')
        errors.push('operation-recovery-cycle')
    }

    try {
        awardRuns = await retryStaleCapturedOperationSpendAwardRuns({
            now: started,
            limit: awardRunLimit,
            staleMs: awardRunStaleMs,
        })
        inspected += awardRuns.inspected
        changed += awardRuns.awarded
        skipped += awardRuns.alreadyFinalized + awardRuns.skipped + awardRuns.notFound
        reviewRequired += awardRuns.reviewRequired
        errors.push(...awardRuns.errors.map(operationId => `award-run:${operationId}`))
    } catch {
        console.error('[Maintenance] Award-run finalization batch failed')
        errors.push('award-run-maintenance')
    }

    try {
        verificationJobs = await repairDueRenewalVerificationJobs({
            now: started,
            limit: verificationJobLimit,
        })
        inspected += verificationJobs.inspected
        changed += verificationJobs.enqueued
        skipped += verificationJobs.alreadyQueued
        retried += verificationJobs.enqueued
        errors.push(...verificationJobs.errors.map(operationId => `verification-job:${operationId}`))
    } catch {
        console.error('[Maintenance] Renewal verification job repair batch failed')
        errors.push('verification-job-maintenance')
    }

    try {
        completionEffects = await repairCompletionEffects({ now: started, limit: staleLimit })
        inspected += completionEffects.inspected
        changed += completionEffects.delivered
        retried += completionEffects.retryScheduled
        if (completionEffects.exhaustedCount > 0) errors.push('completion-effects-exhausted')
    } catch {
        errors.push('completion-effect-maintenance')
    }

    const finished = new Date()
    const summary: MaintenanceCycleSummary = {
        cycleId,
        completionEffects,
        status: errors.length > 0 ? 'degraded' : inspected > 0 ? 'healthy' : 'idle',
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        inspected,
        changed,
        skipped,
        retried,
        reviewRequired,
        refunded,
        awardRuns,
        verificationJobs,
        errors,
    }

    await saveHealth(summary).catch(() => {
        console.error('[Maintenance] Failed to save health')
    })

    console.log('[Maintenance] Cycle summary:', JSON.stringify({
        cycleId: summary.cycleId,
        status: summary.status,
        inspected,
        changed,
        skipped,
        retried,
        reviewRequired,
        refunded,
        awardRuns: {
            inspected: awardRuns.inspected,
            awarded: awardRuns.awarded,
            alreadyFinalized: awardRuns.alreadyFinalized,
            skipped: awardRuns.skipped,
            reviewRequired: awardRuns.reviewRequired,
            notFound: awardRuns.notFound,
            retryScheduled: awardRuns.retryScheduled,
            retryExhausted: awardRuns.retryExhausted,
            errorCount: awardRuns.errors.length,
        },
        verificationJobs: {
            inspected: verificationJobs.inspected,
            enqueued: verificationJobs.enqueued,
            alreadyQueued: verificationJobs.alreadyQueued,
            replacedTerminalJob: verificationJobs.replacedTerminalJob,
            errorCount: verificationJobs.errors.length,
        },
        errorCount: errors.length,
        durationMs: summary.durationMs,
    }))

    return summary
}

export async function startOperationMaintenanceRunner(options?: OperationMaintenanceRunnerOptions) {
    const intervalMs = options?.intervalMs ?? envNumber('MAINTENANCE_INTERVAL_MS', 30000)
    const leaderTtlMs = options?.leaderTtlMs ?? Math.max(intervalMs * 2, 60000)
    let activeCycle: Promise<void> | null = null
    let stopping = false
    let timer: ReturnType<typeof setInterval> | undefined = undefined

    console.log(`[Maintenance] Starting operation maintenance runner interval=${intervalMs}ms`)

    const runCycle = async () => {
        const token = `${process.pid}:${crypto.randomUUID()}`
        const hasLock = await acquireLeaderLock(token, leaderTtlMs).catch(() => {
            console.error('[Maintenance] Failed to acquire leader lock')
            return false
        })

        if (!hasLock) {
            console.log('[Maintenance] Leader lock held by another runner; skipping cycle')
            return
        }

        try {
            await runOperationMaintenanceCycle(options)
        } finally {
            await releaseLeaderLock(token).catch(() => {
                console.error('[Maintenance] Failed to release leader lock')
            })
        }
    }

    // A Redis TTL can expire while a cycle is still running. Never overlap
    // locally; row-level fences still protect work across separate processes.
    const run = () => {
        if (stopping || activeCycle) return activeCycle ?? Promise.resolve()
        const cycle = runCycle()
        activeCycle = cycle
        const clearActive = () => { activeCycle = null }
        void cycle.then(clearActive, clearActive)
        return cycle
    }

    const stop = async () => {
        if (stopping) return
        stopping = true
        clearInterval(timer)
        await activeCycle?.catch(() => undefined)
        await redis.quit().catch(() => undefined)
        await prisma.$disconnect().catch(() => undefined)
        process.exit(0)
    }

    if (!options?.once) {
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)
    }

    await run()
    if (options?.once || stopping) return

    timer = setInterval(() => {
        run().catch(() => console.error('[Maintenance] Unhandled cycle error'))
    }, intervalMs)
}
