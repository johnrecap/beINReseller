import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { addOperationJob, OperationJobData } from '@/lib/queue'
import { mergeOperationPhaseEvidence } from '@/lib/operation-safety'
import { recoverOperationIfNeeded } from '@/lib/operations/recovery'

type DispatchTx = Prisma.TransactionClient

function serializePayload(data: OperationJobData): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue
}

function isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    return message.includes('already exists') || message.includes('jobid')
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
        userId: typeof data.userId === 'string' ? data.userId : undefined,
        customerId: typeof data.customerId === 'string' ? data.customerId : undefined,
        amount: typeof data.amount === 'number' ? data.amount : undefined,
        smartcardType: typeof data.smartcardType === 'string' ? data.smartcardType : undefined,
    }
}

export async function createOperationDispatch(tx: DispatchTx, data: OperationJobData) {
    await tx.operationDispatch.upsert({
        where: {
            operationId_jobType: {
                operationId: data.operationId,
                jobType: data.type,
            },
        },
        create: {
            operationId: data.operationId,
            jobType: data.type,
            payload: serializePayload(data),
            status: 'PENDING',
        },
        update: {
            payload: serializePayload(data),
            status: 'PENDING',
            lastError: null,
        },
    })
}

export async function dispatchPendingOperationJobs(options?: {
    operationIds?: string[]
    limit?: number
    maxAttempts?: number
}) {
    const maxAttempts = options?.maxAttempts ?? 3
    const rows = await prisma.operationDispatch.findMany({
        where: {
            status: 'PENDING',
            attempts: { lt: maxAttempts },
            ...(options?.operationIds?.length
                ? { operationId: { in: options.operationIds } }
                : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: options?.limit || 25,
    })

    let dispatched = 0
    let failed = 0

    for (const row of rows) {
        try {
            const payload = parsePayload(row.payload)
            await addOperationJob(payload)
            await prisma.operationDispatch.update({
                where: { id: row.id },
                data: {
                    status: 'DISPATCHED',
                    attempts: { increment: 1 },
                    lastError: null,
                    dispatchedAt: new Date(),
                },
            })
            dispatched++
        } catch (error) {
            if (isDuplicateJobError(error)) {
                await prisma.operationDispatch.update({
                    where: { id: row.id },
                    data: {
                        status: 'DISPATCHED',
                        attempts: { increment: 1 },
                        lastError: null,
                        dispatchedAt: new Date(),
                    },
                })
                dispatched++
                continue
            }

            failed++
            const message = error instanceof Error ? error.message : String(error)
            await prisma.operationDispatch.update({
                where: { id: row.id },
                data: {
                    attempts: { increment: 1 },
                    lastError: message.slice(0, 1000),
                },
            })
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
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { responseData: true },
    })

    if (!operation) return false

    const updated = await prisma.operation.updateMany({
        where: {
            id: operationId,
            status: 'COMPLETING',
        },
        data: {
            responseMessage: input.message,
            responseData: mergeOperationPhaseEvidence(operation.responseData, {
                phase: input.phase,
                jobType: 'CONFIRM_PURCHASE',
                finalPaySubmitted: false,
            }),
        },
    })

    return updated.count > 0
}

export async function runDispatchWatchdog(options?: {
    maxAttempts?: number
    limit?: number
}) {
    const maxAttempts = options?.maxAttempts ?? 3
    const limit = options?.limit ?? 25

    const retryRows = await prisma.operationDispatch.findMany({
        where: {
            jobType: 'CONFIRM_PURCHASE',
            status: 'PENDING',
            attempts: { lt: maxAttempts },
            operation: { status: 'COMPLETING' },
        },
        select: { operationId: true },
        orderBy: { createdAt: 'asc' },
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
            jobType: 'CONFIRM_PURCHASE',
            status: 'PENDING',
            attempts: { gte: maxAttempts },
            operation: { status: 'COMPLETING' },
        },
        select: { operationId: true },
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
        scanned: retryRows.length + exhaustedRows.length,
        retried: retryResult.dispatched,
        retryFailed: retryResult.failed,
        recovered,
        review,
        refunded,
        skipped,
        errors,
    }
}
