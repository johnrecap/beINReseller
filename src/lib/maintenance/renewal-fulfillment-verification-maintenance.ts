import type { OperationJobData } from '@/lib/queue'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type DueVerification = {
    operationId: string
    attemptCount: number
    nextCheckAt: Date | null
    operation: { cardNumber: string }
}

type VerificationJob = {
    getState(): Promise<string>
    remove(): Promise<void>
}

type VerificationQueue = {
    getJob(jobId: string): Promise<VerificationJob | undefined>
    add(
        name: string,
        data: OperationJobData,
        options: {
            jobId: string
            attempts: number
            backoff: { type: 'exponential'; delay: number }
            removeOnComplete: number
            removeOnFail: number
        }
    ): Promise<unknown>
}

type DueVerificationStore = {
    findDue(now: Date, limit: number): Promise<DueVerification[]>
}

export type RenewalVerificationJobMaintenanceSummary = {
    inspected: number
    enqueued: number
    alreadyQueued: number
    replacedTerminalJob: number
    errors: string[]
}

async function loadDueVerificationStore(): Promise<DueVerificationStore> {
    const { default: prisma } = await import('@/lib/prisma')
    return {
        async findDue(now, limit) {
            return prisma.operationFulfillmentVerification.findMany({
            where: {
                state: 'VERIFYING',
                OR: [
                    { nextCheckAt: { lte: now } },
                    { nextCheckAt: null, lastOutcome: 'MATCHED' },
                ],
                operation: {
                    type: 'RENEW',
                    status: { in: ['COMPLETING', 'REVIEW_REQUIRED'] },
                    providerMutationStartedAt: { not: null },
                },
                AND: [{ OR: [
                    { activeBaselineId: { not: null }, operation: { renewalFlowVersion: 1 } },
                    { activeBaselineId: null, operation: { renewalFlowVersion: 2 } },
                ] }],
            },
            select: {
                operationId: true,
                attemptCount: true,
                nextCheckAt: true,
                operation: { select: { cardNumber: true } },
            },
            orderBy: [
                { nextCheckAt: 'asc' },
                { operationId: 'asc' },
            ],
            take: limit,
            })
        },
    }
}

export function buildRenewalVerificationJobId(
    operationId: string,
    verificationAttempt: number
): string {
    return `VERIFY_RENEWAL_FULFILLMENT--${operationId}--${verificationAttempt}`
}

function boundedLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit) || limit === undefined || limit <= 0) return DEFAULT_LIMIT
    return Math.min(Math.trunc(limit), MAX_LIMIT)
}

export async function repairDueRenewalVerificationJobs(input: {
    now: Date
    limit?: number
    store?: DueVerificationStore
    queue?: VerificationQueue
}): Promise<RenewalVerificationJobMaintenanceSummary> {
    const store = input.store ?? await loadDueVerificationStore()
    const queue = input.queue ?? (await import('@/lib/queue')).operationsQueue
    const due = await store.findDue(input.now, boundedLimit(input.limit))
    const summary: RenewalVerificationJobMaintenanceSummary = {
        inspected: due.length,
        enqueued: 0,
        alreadyQueued: 0,
        replacedTerminalJob: 0,
        errors: [],
    }

    for (const verification of due) {
        const verificationAttempt = verification.attemptCount + 1
        const jobId = buildRenewalVerificationJobId(
            verification.operationId,
            verificationAttempt
        )
        try {
            const existing = await queue.getJob(jobId)
            if (existing) {
                const state = await existing.getState()
                if (state !== 'completed' && state !== 'failed') {
                    summary.alreadyQueued++
                    continue
                }
                await existing.remove()
                summary.replacedTerminalJob++
            }

            await queue.add('process-operation', {
                operationId: verification.operationId,
                type: 'VERIFY_RENEWAL_FULFILLMENT',
                cardNumber: verification.operation.cardNumber,
                verificationAttempt,
                queueTarget: 'RESELLER',
            }, {
                jobId,
                attempts: 4,
                backoff: { type: 'exponential', delay: 1_000 },
                removeOnComplete: 100,
                removeOnFail: 1000,
            })
            summary.enqueued++
        } catch {
            summary.errors.push(verification.operationId)
        }
    }

    return summary
}
