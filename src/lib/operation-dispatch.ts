import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { addOperationJob, OperationJobData } from '@/lib/queue'

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
}) {
    const rows = await prisma.operationDispatch.findMany({
        where: {
            status: 'PENDING',
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
