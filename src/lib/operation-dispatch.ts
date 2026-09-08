import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { addCustomerOperationJob, addOperationJob, OperationJobData } from '@/lib/queue'
import { mergeOperationPhaseEvidence } from '@/lib/operation-safety'
import { recoverOperationIfNeeded } from '@/lib/operations/recovery'
import { actionRevision, canonicalJson, quoteData, quoteRevisionOf } from '../../shared/operations/package-quote'
import { lockFinancialOperation } from '../../shared/operations/financial-lock'

type DispatchTx = Prisma.TransactionClient

const NON_DISPATCHABLE_OPERATION_STATUSES = [
    'REVIEW_REQUIRED',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
] as const

function serializePayload(data: OperationJobData): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue
}

const DELIVERY_RETRY_DELAYS_MS = [5000, 30000, 120000, 600000] as const

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
    return value !== undefined && Number.isFinite(value)
        ? Math.max(1, Math.min(maximum, Math.floor(value))) : fallback
}

function retryAt(attempt: number): Date {
    return new Date(Date.now() + DELIVERY_RETRY_DELAYS_MS[Math.min(3, Math.max(0, attempt - 1))])
}

function parsePayload(payload: Prisma.JsonValue): OperationJobData {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid operation dispatch payload')
    }

    const data = payload as Record<string, unknown>
    if (
        typeof data.operationId !== 'string' ||
        typeof data.type !== 'string' ||
        typeof data.cardNumber !== 'string'
    ) {
        throw new Error('Invalid operation dispatch payload')
    }

    return {
        operationId: data.operationId,
        type: data.type,
        cardNumber: data.cardNumber,
        duration: typeof data.duration === 'string' ? data.duration : undefined,
        promoCode: typeof data.promoCode === 'string' ? data.promoCode : undefined,
        promoAction: data.promoAction === 'REMOVE' ? 'REMOVE' : undefined,
        actionRevision: actionRevision(data.type as string, data.actionRevision),
        userId: typeof data.userId === 'string' ? data.userId : undefined,
        customerId: typeof data.customerId === 'string' ? data.customerId : undefined,
        amount: typeof data.amount === 'number' ? data.amount : undefined,
        smartcardType: typeof data.smartcardType === 'string' ? data.smartcardType : undefined,
        queueTarget: data.queueTarget === 'CUSTOMER' ? 'CUSTOMER' : 'RESELLER',
    }
}

export async function createOperationDispatch(tx: DispatchTx, data: OperationJobData) {
    const revision = actionRevision(data.type, data.actionRevision)
    const payload = serializePayload(data)
    const existing = await tx.operationDispatch.findUnique({
        where: {
            operationId_jobType_actionRevision: {
                operationId: data.operationId,
                jobType: data.type,
                actionRevision: revision,
            },
        },
        select: { payload: true, status: true },
    })
    if (existing) {
        const comparable = (value: Prisma.JsonValue | Prisma.InputJsonValue) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return canonicalJson(value)
            return canonicalJson({ ...value, actionRevision: actionRevision(data.type, (value as Record<string, unknown>).actionRevision) })
        }
        if (comparable(existing.payload) !== comparable(payload)) {
            throw new Error('OPERATION_DISPATCH_PAYLOAD_CONFLICT')
        }
        if (['PENDING', 'DISPATCHING', 'DISPATCHED'].includes(existing.status)) return
        throw new Error('OPERATION_DISPATCH_TERMINAL_STATE_CONFLICT')
    }

    await tx.operationDispatch.create({
        data: {
            operationId: data.operationId,
            jobType: data.type,
            actionRevision: revision,
            payload,
            status: 'PENDING',
        },
    })
}

export async function dispatchPendingOperationJobs(options?: {
    operationIds?: string[]
    limit?: number
    maxAttempts?: number
}) {
    const maxAttempts = boundedInteger(options?.maxAttempts, 5, 5)
    const rows = await prisma.operationDispatch.findMany({
        where: {
            status: 'PENDING',
            attempts: { lt: maxAttempts },
            nextAttemptAt: { lte: new Date() },
            operation: {
                status: { notIn: [...NON_DISPATCHABLE_OPERATION_STATUSES] },
            },
            ...(options?.operationIds?.length
                ? { operationId: { in: options.operationIds } }
                : {}),
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: boundedInteger(options?.limit, 50, 200),
    })

    let dispatched = 0
    let failed = 0

    for (const row of rows) {
        // Claim before touching the external queue. A concurrent refund/review
        // can atomically stop a still-PENDING row; once this CAS succeeds the
        // refund finalizer treats the row as potentially delivered.
        const claim = await prisma.operationDispatch.updateMany({
            where: {
                id: row.id,
                status: 'PENDING',
                attempts: row.attempts,
                nextAttemptAt: { lte: new Date() },
                operation: {
                    status: { notIn: [...NON_DISPATCHABLE_OPERATION_STATUSES] },
                },
            },
            data: {
                status: 'DISPATCHING',
                attempts: { increment: 1 },
                lastError: null,
            },
        })
        if (claim.count !== 1) continue
        const ownedClaim = { id: row.id, status: 'DISPATCHING', attempts: row.attempts + 1 }

        try {
            const payload = parsePayload(row.payload)
            if (payload.queueTarget === 'CUSTOMER' && payload.customerId) {
                await addCustomerOperationJob({
                    operationId: payload.operationId,
                    type: payload.type,
                    cardNumber: payload.cardNumber,
                    duration: payload.duration,
                    customerId: payload.customerId,
                    amount: payload.amount,
                })
            } else {
                await addOperationJob(payload)
            }
            const acknowledged = await prisma.operationDispatch.updateMany({
                where: ownedClaim,
                data: {
                    status: 'DISPATCHED',
                    lastError: null,
                    dispatchedAt: new Date(),
                },
            })
            dispatched += acknowledged.count
        } catch {
            // BullMQ resolves an existing stable job identity normally. A
            // thrown error (including invalid jobId) never proves delivery.
            failed++
            const held = await prisma.operationDispatch.updateMany({
                where: {
                    ...ownedClaim,
                    operation: {
                        status: { in: [...NON_DISPATCHABLE_OPERATION_STATUSES] },
                    },
                },
                data: {
                    status: 'REVIEW_REQUIRED',
                    lastError: 'OPERATION_QUEUE_DELIVERY_FAILED',
                },
            })
            if (held.count === 0) {
                await prisma.operationDispatch.updateMany({
                    where: {
                        ...ownedClaim,
                        operation: {
                            status: { notIn: [...NON_DISPATCHABLE_OPERATION_STATUSES] },
                        },
                    },
                    data: {
                        status: 'PENDING',
                        lastError: 'OPERATION_QUEUE_DELIVERY_FAILED',
                        nextAttemptAt: retryAt(row.attempts + 1),
                    },
                })
            }
        }
    }

    return { scanned: rows.length, dispatched, failed }
}

export async function recordOperationDispatchEvidence(
    operationId: string,
    input: {
        phase: 'DISPATCH_PENDING' | 'DISPATCH_FAILED'
        message: string
    }
) {
    return prisma.$transaction(async tx => {
    if (!await lockFinancialOperation(tx, operationId)) return false
    const operation = await tx.operation.findUnique({
        where: { id: operationId },
        select: { responseData: true, providerMutationStartedAt: true, providerMutationStage: true },
    })

    if (!operation) return false
    const evidence = quoteData(operation.responseData)
    if (operation.providerMutationStartedAt || operation.providerMutationStage || evidence.finalPaySubmitted === true ||
        evidence.finalPayRequestStartedAt || evidence.finalPaySubmittedAt) return false

    const updated = await tx.operation.updateMany({
        where: {
            id: operationId,
            status: 'COMPLETING',
        },
        data: {
            responseMessage: input.message,
            responseData: mergeOperationPhaseEvidence(operation.responseData, {
                phase: input.phase,
                jobType: 'CONFIRM_PURCHASE',
            }),
        },
    })

    return updated.count > 0
    })
}

export async function runDispatchWatchdog(options?: {
    maxAttempts?: number
    limit?: number
}) {
    const maxAttempts = boundedInteger(options?.maxAttempts, 5, 5)
    const limit = boundedInteger(options?.limit, 50, 200)

    // A process can exit after claiming a row and before recording queue
    // delivery. Queue job IDs are idempotent, so stale claims are safely
    // returned to PENDING for a bounded retry.
    const staleClaimCutoff = new Date(Date.now() - 5 * 60 * 1000)
    const staleClaims = await prisma.operationDispatch.findMany({
        where: { status: 'DISPATCHING', updatedAt: { lt: staleClaimCutoff } },
        select: { id: true, attempts: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' }, take: limit,
    })
    for (const row of staleClaims) {
        const ownedClaim = { id: row.id, status: 'DISPATCHING', attempts: row.attempts, updatedAt: row.updatedAt }
        const held = await prisma.operationDispatch.updateMany({
            where: { ...ownedClaim, operation: { status: { in: [...NON_DISPATCHABLE_OPERATION_STATUSES] } } },
            data: { status: 'REVIEW_REQUIRED', lastError: 'STALE_DISPATCH_CLAIM_HELD_FOR_REVIEW' },
        })
        if (!held.count) await prisma.operationDispatch.updateMany({
            where: { ...ownedClaim, operation: { status: { notIn: [...NON_DISPATCHABLE_OPERATION_STATUSES] } } },
            data: { status: 'PENDING', lastError: 'STALE_DISPATCH_CLAIM_RECOVERED', nextAttemptAt: retryAt(row.attempts) },
        })
    }

    const retryRows = await prisma.operationDispatch.findMany({
        where: {
            status: 'PENDING',
            attempts: { lt: maxAttempts },
            nextAttemptAt: { lte: new Date() },
            operation: { status: { notIn: [...NON_DISPATCHABLE_OPERATION_STATUSES] } },
        },
        select: { operationId: true },
        orderBy: { nextAttemptAt: 'asc' },
        take: limit,
    })

    const retryResult = retryRows.length > 0
        ? await dispatchPendingOperationJobs({
            operationIds: retryRows.map(row => row.operationId),
            limit,
            maxAttempts,
        })
        : { scanned: 0, dispatched: 0, failed: 0 }

    const exhaustedRows = await prisma.operationDispatch.findMany({
        where: {
            status: 'PENDING',
            attempts: { gte: maxAttempts },
            operation: { status: { notIn: [...NON_DISPATCHABLE_OPERATION_STATUSES] } },
        },
        select: { id: true, operationId: true, jobType: true },
        orderBy: { updatedAt: 'asc' },
        take: limit,
    })

    let recovered = 0
    let review = 0
    let refunded = 0
    let skipped = 0
    const errors: string[] = []

    for (const row of exhaustedRows) {
        try {
            if (row.jobType !== 'CONFIRM_PURCHASE') {
                const changed = await settlePreparationDispatchExhaustion(row.id, maxAttempts)
                if (changed) recovered++
                else skipped++
                continue
            }
            await recordOperationDispatchEvidence(row.operationId, {
                phase: 'DISPATCH_FAILED',
                message: 'Confirm purchase dispatch failed repeatedly; recovery started.',
            })
            const recovery = await recoverOperationIfNeeded(row.operationId, 'timeout')
            if (recovery.changed) recovered++
            if (recovery.reviewRequired) review++
            if (recovery.refundApplied) refunded++
            if (recovery.skipped || !recovery.changed) skipped++
        } catch (error) {
            console.error(`[Dispatch Watchdog] Failed to recover operation ${row.operationId}:`, error)
            errors.push(row.operationId)
        }
    }

    return {
        scanned: staleClaims.length + retryRows.length + exhaustedRows.length,
        retried: retryResult.dispatched,
        retryFailed: retryResult.failed,
        recovered,
        review,
        refunded,
        skipped,
        errors,
    }
}

/** Exhaustion cannot prove non-delivery. Stop this identity durably and only
 * change the stage it still owns. A later promo revision/result is preserved. */
export async function settlePreparationDispatchExhaustion(dispatchId: string, maxAttempts = 5): Promise<boolean> {
    return prisma.$transaction(async tx => {
        const candidate = await tx.operationDispatch.findUnique({ where: { id: dispatchId } })
        if (!candidate || candidate.jobType === 'CONFIRM_PURCHASE' ||
            !await lockFinancialOperation(tx, candidate.operationId)) return false
        const row = await tx.operationDispatch.findUnique({ where: { id: dispatchId } })
        if (!row || row.status !== 'PENDING' || row.attempts < maxAttempts) return false
        const operation = await tx.operation.findUnique({ where: { id: row.operationId } })
        if (!operation) return false
        const claimed = await tx.operationDispatch.updateMany({
            where: { id: row.id, status: 'PENDING', attempts: { gte: maxAttempts } },
            data: { status: 'REVIEW_REQUIRED', lastError: 'OPERATION_DISPATCH_EXHAUSTED' },
        })
        if (claimed.count !== 1) return false
        if (row.jobType === 'APPLY_PROMO') {
            const data = quoteData(operation.responseData)
            if (operation.status === 'AWAITING_PACKAGE' && data.refreshing === true &&
                quoteRevisionOf(data) === row.actionRevision) {
                await tx.operation.update({ where: { id: operation.id }, data: {
                    responseData: JSON.stringify({ ...data, quoteState: 'FAILED', refreshing: false,
                        promoApplied: false, error: 'PROMO_REFRESH_FAILED' }),
                } })
            }
        } else if (operation.status === 'PENDING' || operation.status === 'PROCESSING' ||
            (['COMPLETE_PURCHASE', 'CONFIRM_INSTALLMENT', 'CANCEL_CONFIRM'].includes(row.jobType) && operation.status === 'COMPLETING')) {
            await tx.operation.update({ where: { id: operation.id }, data: {
                status: 'REVIEW_REQUIRED', responseMessage: 'OPERATION_DISPATCH_EXHAUSTED', finalConfirmExpiry: null,
            } })
        }
        return true
    })
}
