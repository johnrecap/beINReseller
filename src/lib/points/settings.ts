import type { PointRuleOwnerType, Prisma } from '@prisma/client'
import { resolveOwnerRate, validatePointProgramSettings } from '@/lib/points/calculation'

export type PointSettingsReader = Pick<Prisma.TransactionClient, 'pointProgramSettings' | 'pointRule'>

export type PointProgramSettingsSnapshot = {
    pointsEnabled: boolean
    pointsStartAt: Date | null
    cashConversionPoints: number
    cashConversionAmountUsd: number
    managerOwnedUserPointsEnabled: boolean
}

export async function getPointProgramSettings(
    db: PointSettingsReader
): Promise<PointProgramSettingsSnapshot> {
    const settings = await db.pointProgramSettings.findUnique({
        where: { id: 'default' },
        select: {
            pointsEnabled: true,
            pointsStartAt: true,
            cashConversionPoints: true,
            cashConversionAmountUsd: true,
            managerOwnedUserPointsEnabled: true,
        },
    })

    return settings ?? {
        pointsEnabled: false,
        pointsStartAt: null,
        cashConversionPoints: 0,
        cashConversionAmountUsd: 0,
        managerOwnedUserPointsEnabled: false,
    }
}

async function findActiveRuleRate(
    db: PointSettingsReader,
    ownerType: PointRuleOwnerType,
    ownerUserId: string | null
): Promise<number | null> {
    const rule = await db.pointRule.findFirst({
        where: {
            ownerType,
            ownerUserId,
            isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
        select: { pointsPerThousand: true },
    })

    return rule?.pointsPerThousand ?? null
}

export async function getSpendPointRate(input: {
    db: PointSettingsReader
    ownerKind: 'USER' | 'AGENT' | 'MANAGER' | 'MANAGER_OWNED_USER'
    ownerUserId: string
}): Promise<number> {
    if (input.ownerKind === 'USER') {
        return findActiveRuleRate(input.db, 'USER_GLOBAL', null).then((rate) => rate ?? 0)
    }

    if (input.ownerKind === 'MANAGER_OWNED_USER') {
        return findActiveRuleRate(input.db, 'MANAGER_OWNED_USER_DEFAULT', null).then((rate) => rate ?? 0)
    }

    if (input.ownerKind === 'AGENT') {
        const [defaultRate, overrideRate] = await Promise.all([
            findActiveRuleRate(input.db, 'AGENT_DEFAULT', null),
            findActiveRuleRate(input.db, 'AGENT_OVERRIDE', input.ownerUserId),
        ])

        return resolveOwnerRate({
            defaultRate: defaultRate ?? 0,
            overrideRate,
        })
    }

    const [defaultRate, overrideRate] = await Promise.all([
        findActiveRuleRate(input.db, 'MANAGER_DEFAULT', null),
        findActiveRuleRate(input.db, 'MANAGER_OVERRIDE', input.ownerUserId),
    ])

    return resolveOwnerRate({
        defaultRate: defaultRate ?? 0,
        overrideRate,
    })
}

export function getConversionReadiness(settings: PointProgramSettingsSnapshot) {
    return validatePointProgramSettings(settings)
}
