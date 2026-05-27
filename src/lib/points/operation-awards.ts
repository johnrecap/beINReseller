import { calculateSpendPoints } from '@/lib/points/calculation'
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { getPointProgramSettings, getSpendPointRate } from '@/lib/points/settings'

export type AwardableRateKind = 'USER' | 'AGENT' | 'MANAGER'
export type AwardableOwnerRole = AwardableRateKind | 'ADMIN'

export type AwardableUser = {
    id: string
    role: AwardableOwnerRole | string
    isActive: boolean
    deletedAt: Date | string | null
    createdBy?: AwardableUser | null
}

export type OperationPointRecipient = {
    ownerUserId: string
    ownerRole: AwardableOwnerRole
    ownerKind: AwardableRateKind
}

export type RatedOperationPointRecipient = OperationPointRecipient & {
    ratePerThousand: number
}

export type OperationSpendAwardEntry = {
    ownerUserId: string
    ownerRoleAtTime: AwardableOwnerRole
    sourceType: 'OPERATION_SPEND'
    sourceId: string
    points: number
    status: 'AVAILABLE'
    ratePerThousandSnapshot: number
    amountUsdSnapshot: number
    notes: string
}

export type OperationSpendEligibilityInput = {
    status: string
    type?: string
    amount: number
    completedAt: Date | null
    settings: {
        pointsEnabled: boolean
        pointsStartAt: Date | null
    }
}

export type OperationSpendEligibility =
    | { eligible: true }
    | {
        eligible: false
        reason:
        | 'POINTS_DISABLED'
        | 'MISSING_COMPLETED_AT'
        | 'NOT_COMPLETED'
        | 'NOT_SUBSCRIPTION_OPERATION'
        | 'NON_POSITIVE_AMOUNT'
        | 'BEFORE_POINTS_START'
    }

function isReceivableOwner(user: AwardableUser | null | undefined, role: AwardableOwnerRole): user is AwardableUser {
    return Boolean(user && user.role === role && user.isActive && !user.deletedAt)
}

function isReceivableAdmin(user: AwardableUser | null | undefined): user is AwardableUser {
    return isReceivableOwner(user, 'ADMIN')
}

export function resolveOperationPointRecipients(input: {
    operationUser: AwardableUser
    managerOwnership: { manager: AwardableUser } | null
    agentAssignment: { agent: AwardableUser } | null
}): OperationPointRecipient[] {
    if (isReceivableOwner(input.managerOwnership?.manager, 'MANAGER')) {
        return [{
            ownerUserId: input.managerOwnership.manager.id,
            ownerRole: 'MANAGER',
            ownerKind: 'MANAGER',
        }]
    }

    if (isReceivableOwner(input.agentAssignment?.agent, 'AGENT')) {
        const recipients: OperationPointRecipient[] = []

        if (isReceivableOwner(input.operationUser, 'USER')) {
            recipients.push({
                ownerUserId: input.operationUser.id,
                ownerRole: 'USER',
                ownerKind: 'USER',
            })
        }

        recipients.push({
            ownerUserId: input.agentAssignment.agent.id,
            ownerRole: 'AGENT',
            ownerKind: 'AGENT',
        })

        return recipients
    }

    if (isReceivableAdmin(input.operationUser.createdBy)) {
        return [{
            ownerUserId: input.operationUser.createdBy.id,
            ownerRole: 'ADMIN',
            ownerKind: 'MANAGER',
        }]
    }

    return []
}

export function getOperationSpendEligibility(
    input: OperationSpendEligibilityInput
): OperationSpendEligibility {
    if (!input.settings.pointsEnabled) return { eligible: false, reason: 'POINTS_DISABLED' }
    if (input.status !== 'COMPLETED') return { eligible: false, reason: 'NOT_COMPLETED' }
    if (input.type && input.type !== 'RENEW') return { eligible: false, reason: 'NOT_SUBSCRIPTION_OPERATION' }
    if (input.amount <= 0) return { eligible: false, reason: 'NON_POSITIVE_AMOUNT' }
    if (!input.completedAt) return { eligible: false, reason: 'MISSING_COMPLETED_AT' }
    if (input.settings.pointsStartAt && input.completedAt < input.settings.pointsStartAt) {
        return { eligible: false, reason: 'BEFORE_POINTS_START' }
    }

    return { eligible: true }
}

export function buildOperationSpendAwardEntries(input: {
    operationId: string
    amountUsd: number
    recipients: RatedOperationPointRecipient[]
}): OperationSpendAwardEntry[] {
    return input.recipients.flatMap((recipient) => {
        const calculation = calculateSpendPoints({
            amountUsd: input.amountUsd,
            pointsPerThousand: recipient.ratePerThousand,
        })

        if (calculation.points <= 0) return []

        return [{
            ownerUserId: recipient.ownerUserId,
            ownerRoleAtTime: recipient.ownerRole,
            sourceType: 'OPERATION_SPEND',
            sourceId: input.operationId,
            points: calculation.points,
            status: 'AVAILABLE',
            ratePerThousandSnapshot: calculation.ratePerThousandSnapshot,
            amountUsdSnapshot: calculation.amountUsdSnapshot,
            notes: `Spend points for completed operation ${input.operationId}`,
        }]
    })
}

export type OperationSpendAwardResult = {
    operationId: string
    awarded: OperationSpendAwardEntry[]
    skippedReason:
    | null
    | 'POINTS_DISABLED'
    | 'MISSING_COMPLETED_AT'
    | 'NOT_COMPLETED'
    | 'NOT_SUBSCRIPTION_OPERATION'
    | 'NON_POSITIVE_AMOUNT'
    | 'BEFORE_POINTS_START'
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
    const eligibility = getOperationSpendEligibility({
        status: operation.status,
        type: operation.type,
        amount: operation.amount,
        completedAt: operation.completedAt,
        settings,
    })

    if (!eligibility.eligible) {
        return { operationId, awarded: [], skippedReason: eligibility.reason }
    }

    const recipients = resolveOperationPointRecipients({
        operationUser: operation.user,
        managerOwnership: operation.user.managerLink[0] ?? null,
        agentAssignment: operation.user.agentAssignmentAsUser[0] ?? null,
    })

    const ratedRecipients = await Promise.all(recipients.map(async (recipient) => ({
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
