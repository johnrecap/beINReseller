import type { PointRuleOwnerType } from '@prisma/client'

export type PointOwnerKind = 'USER' | 'AGENT' | 'MANAGER'

export type PointRuleReader = {
    pointRule: {
        findFirst(args: {
            where: {
                ownerType: PointRuleOwnerType
                ownerUserId?: string | null
                isActive: boolean
            }
            orderBy: { updatedAt: 'desc' }
            select: { pointsPerThousand: true }
        }): Promise<{ pointsPerThousand: number } | null>
    }
}

export type PointCalculationInput = {
    ownerKind: PointOwnerKind
    amountUsd: number
    pointsPerThousand: number
}

export type PointCalculationResult = {
    ownerKind: PointOwnerKind
    points: number
    amountUsdSnapshot: number
    ratePerThousandSnapshot: number
}

const POINT_DECIMAL_PLACES = 4
const POINT_SCALE = 10 ** POINT_DECIMAL_PLACES

export function roundPoints(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.round(value * POINT_SCALE) / POINT_SCALE
}

export function calculatePoints(input: PointCalculationInput): PointCalculationResult {
    const amountUsd = Math.max(0, input.amountUsd)
    const pointsPerThousand = Math.max(0, input.pointsPerThousand)
    const rawPoints = (amountUsd / 1000) * pointsPerThousand

    return {
        ownerKind: input.ownerKind,
        points: roundPoints(rawPoints),
        amountUsdSnapshot: amountUsd,
        ratePerThousandSnapshot: pointsPerThousand,
    }
}

export function hasPositivePoints(result: PointCalculationResult): boolean {
    return result.points > 0
}

async function getActiveRuleRate(
    db: PointRuleReader,
    ownerType: PointRuleOwnerType,
    ownerUserId?: string | null
): Promise<number | null> {
    const rule = await db.pointRule.findFirst({
        where: {
            ownerType,
            ownerUserId: ownerUserId ?? null,
            isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
        select: { pointsPerThousand: true },
    })

    return rule?.pointsPerThousand ?? null
}

export async function getUserCreditRequestRate(db: PointRuleReader): Promise<number> {
    return (await getActiveRuleRate(db, 'USER_GLOBAL')) ?? 0
}

export async function getAgentCreditRequestRate(
    db: PointRuleReader,
    agentId: string | null | undefined
): Promise<number> {
    if (agentId) {
        const overrideRate = await getActiveRuleRate(db, 'AGENT_OVERRIDE', agentId)
        if (overrideRate !== null) return overrideRate
    }

    return (await getActiveRuleRate(db, 'AGENT_DEFAULT')) ?? 0
}

export async function getManagerTopupRate(
    db: PointRuleReader,
    managerId: string | null | undefined
): Promise<number> {
    if (managerId) {
        const overrideRate = await getActiveRuleRate(db, 'MANAGER_OVERRIDE', managerId)
        if (overrideRate !== null) return overrideRate
    }

    return (await getActiveRuleRate(db, 'MANAGER_DEFAULT')) ?? 0
}
