import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { getPointProgramSettings, getSpendPointRate } from '@/lib/points/settings'
import {
    buildOperationSpendAwardEntries,
    getOperationSpendEligibility,
    resolveOperationPointRecipients,
    resolveOperationSpendAwardPolicy,
} from '../../../shared/points/operation-spend-policy'
import type {
    AwardableOwnerRole,
    AwardableRateKind,
    AwardableUser,
    OperationPointRecipient,
    OperationSpendAwardEntry,
    OperationSpendEligibility,
    OperationSpendEligibilityInput,
    OperationSpendSkippedReason,
    RatedOperationPointRecipient,
} from '../../../shared/points/operation-spend-policy'

export {
    buildOperationSpendAwardEntries,
    getOperationSpendEligibility,
    resolveOperationPointRecipients,
    resolveOperationSpendAwardPolicy,
}
export type {
    AwardableOwnerRole,
    AwardableRateKind,
    AwardableUser,
    OperationPointRecipient,
    OperationSpendAwardEntry,
    OperationSpendEligibility,
    OperationSpendEligibilityInput,
    RatedOperationPointRecipient,
}

export type OperationSpendAwardResult = {
    operationId: string
    awarded: OperationSpendAwardEntry[]
    skippedReason:
    | null
    | OperationSpendSkippedReason
    | 'OPERATION_NOT_FOUND'
    | 'USER_NOT_FOUND'
}

type AwardDbClient = Pick<
    Prisma.TransactionClient,
    'operation' | 'pointLedgerEntry' | 'pointProgramSettings' | 'pointRule'
>

export async function processCompletedOperationPoints(
    operationId: string,
    db: { $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> } = prisma
): Promise<OperationSpendAwardResult> {
    return db.$transaction(async (tx) => processCompletedOperationPointsInTransaction(operationId, tx))
}

export async function processCompletedOperationPointsInTransaction(
    operationId: string,
    db: AwardDbClient
): Promise<OperationSpendAwardResult> {
    const operation = await db.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            status: true,
            type: true,
            amount: true,
            completedAt: true,
            user: {
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                    createdBy: {
                        select: {
                            id: true,
                            role: true,
                            isActive: true,
                            deletedAt: true,
                        },
                    },
                    managerLink: {
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            manager: {
                                select: {
                                    id: true,
                                    role: true,
                                    isActive: true,
                                    deletedAt: true,
                                },
                            },
                        },
                    },
                    agentAssignmentAsUser: {
                        where: { isActive: true },
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            agent: {
                                select: {
                                    id: true,
                                    role: true,
                                    isActive: true,
                                    deletedAt: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    })

    if (!operation) {
        return { operationId, awarded: [], skippedReason: 'OPERATION_NOT_FOUND' }
    }

    if (!operation.user) {
        return { operationId, awarded: [], skippedReason: 'USER_NOT_FOUND' }
    }

    const settings = await getPointProgramSettings(db)
    const policy = resolveOperationSpendAwardPolicy({
        status: operation.status,
        type: operation.type,
        amount: operation.amount,
        completedAt: operation.completedAt,
        settings,
        operationUser: operation.user,
        managerOwnership: operation.user.managerLink[0] ?? null,
        agentAssignment: operation.user.agentAssignmentAsUser[0] ?? null,
    })

    if (!policy.eligible) {
        return { operationId, awarded: [], skippedReason: policy.skippedReason }
    }

    const ratedRecipients = await Promise.all(policy.recipients.map(async (recipient) => ({
        ...recipient,
        ratePerThousand: await getSpendPointRate({
            db,
            ownerKind: recipient.ownerKind,
            ownerUserId: recipient.ownerUserId,
        }),
    })))

    const entries = buildOperationSpendAwardEntries({
        operationId,
        amountUsd: operation.amount,
        recipients: ratedRecipients,
    })

    if (entries.length === 0) {
        return { operationId, awarded: [], skippedReason: 'NON_POSITIVE_AMOUNT' }
    }

    await db.pointLedgerEntry.createMany({
        data: entries.map((entry) => ({
            ...entry,
            operationId,
        })),
        skipDuplicates: true,
    })

    return {
        operationId,
        awarded: entries,
        skippedReason: null,
    }
}
