import type { Role } from '@prisma/client'

export type OriginalSpendPointEntry = {
    id: string
    ownerUserId: string
    ownerRoleAtTime: Role
    points: number
}

export type PointReversalDb = {
    pointLedgerEntry: {
        findMany(args: {
            where: {
                operationId: string
                sourceType: 'OPERATION_SPEND'
                points: { gt: number }
            }
            select: {
                id: true
                ownerUserId: true
                ownerRoleAtTime: true
                points: true
            }
        }): Promise<OriginalSpendPointEntry[]>
        createMany(args: {
            data: Array<PointReversalEntry & { operationId: string; status: 'REDEEMED' }>
            skipDuplicates: boolean
        }): Promise<{ count: number }>
    }
}

export type PointReversalEntry = {
    ownerUserId: string
    ownerRoleAtTime: Role
    sourceType: 'POINT_REVERSAL'
    sourceId: string
    points: number
    notes: string
}

export function buildPointReversalEntries(input: {
    operationId: string
    reason: string
    originalEntries: OriginalSpendPointEntry[]
}): PointReversalEntry[] {
    return input.originalEntries
        .filter((entry) => entry.points > 0)
        .map((entry) => ({
            ownerUserId: entry.ownerUserId,
            ownerRoleAtTime: entry.ownerRoleAtTime,
            sourceType: 'POINT_REVERSAL',
            sourceId: `${input.operationId}:${entry.ownerUserId}:${input.reason}`,
            points: -entry.points,
            notes: `Point reversal for operation ${input.operationId} because ${input.reason}`,
        }))
}

export async function createOperationPointReversalsInTransaction(input: {
    db: PointReversalDb
    operationId: string
    reason: string
}): Promise<{ count: number }> {
    const originalEntries = await input.db.pointLedgerEntry.findMany({
        where: {
            operationId: input.operationId,
            sourceType: 'OPERATION_SPEND',
            points: { gt: 0 },
        },
        select: {
            id: true,
            ownerUserId: true,
            ownerRoleAtTime: true,
            points: true,
        },
    })

    const reversals = buildPointReversalEntries({
        operationId: input.operationId,
        reason: input.reason,
        originalEntries,
    })

    if (reversals.length === 0) return { count: 0 }

    return input.db.pointLedgerEntry.createMany({
        data: reversals.map((reversal) => ({
            ...reversal,
            operationId: input.operationId,
            status: 'REDEEMED',
        })),
        skipDuplicates: true,
    })
}
