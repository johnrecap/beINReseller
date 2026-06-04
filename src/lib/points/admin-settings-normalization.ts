import { z } from 'zod'

const rateSchema = z.number().min(0).max(100000)

const overrideSchema = z.object({
    pointsPerThousand: rateSchema,
})

const agentOverrideSchema = overrideSchema.extend({
    agentId: z.string().min(1),
})

const managerOverrideSchema = overrideSchema.extend({
    managerId: z.string().min(1),
})

const pointSettingsInputSchema = z.object({
    pointsEnabled: z.boolean().optional().default(false),
    pointsStartAt: z.string().datetime().nullable().optional().default(null),
    userPointsPerThousand: rateSchema.optional(),
    agentPointsPerThousand: rateSchema.optional(),
    managerPointsPerThousand: rateSchema.optional(),
    userGlobalPointsPerThousand: rateSchema.optional(),
    managerOwnedUserPointsEnabled: z.boolean().optional().default(false),
    managerOwnedUserPointsPerThousand: rateSchema.optional().default(0),
    agentDefaultPointsPerThousand: rateSchema.optional(),
    managerDefaultPointsPerThousand: rateSchema.optional(),
    cashConversionPoints: z.number().positive(),
    cashConversionAmountUsd: z.number().positive(),
    agentOverrides: z.array(agentOverrideSchema).optional().default([]),
    managerOverrides: z.array(managerOverrideSchema).optional().default([]),
}).superRefine((value, ctx) => {
    if (value.pointsEnabled && !value.pointsStartAt) {
        ctx.addIssue({
            code: 'custom',
            path: ['pointsStartAt'],
            message: 'pointsStartAt is required when points are enabled',
        })
    }

    const userRate = value.userGlobalPointsPerThousand ?? value.userPointsPerThousand
    const agentRate = value.agentDefaultPointsPerThousand ?? value.agentPointsPerThousand
    const managerRate = value.managerDefaultPointsPerThousand ?? value.managerPointsPerThousand

    if (userRate === undefined) {
        ctx.addIssue({ code: 'custom', path: ['userGlobalPointsPerThousand'], message: 'User point rate is required' })
    }
    if (agentRate === undefined) {
        ctx.addIssue({ code: 'custom', path: ['agentDefaultPointsPerThousand'], message: 'Agent point rate is required' })
    }
    if (managerRate === undefined) {
        ctx.addIssue({ code: 'custom', path: ['managerDefaultPointsPerThousand'], message: 'Manager point rate is required' })
    }
})

export type NormalizedPointSettingsInput = {
    pointsEnabled: boolean
    pointsStartAt: string | null
    cashConversionPoints: number
    cashConversionAmountUsd: number
    userGlobalPointsPerThousand: number
    managerOwnedUserPointsEnabled: boolean
    managerOwnedUserPointsPerThousand: number
    agentDefaultPointsPerThousand: number
    managerDefaultPointsPerThousand: number
    agentOverrides: Array<{ agentId: string; pointsPerThousand: number }>
    managerOverrides: Array<{ managerId: string; pointsPerThousand: number }>
}

export type NormalizePointSettingsResult =
    | { ok: true; data: NormalizedPointSettingsInput }
    | {
        ok: false
        error: string
        details?: unknown
        duplicateAgentIds: string[]
        duplicateManagerIds: string[]
    }

export type PointSettingsResponseInput = {
    settings: {
        pointsEnabled: boolean
        pointsStartAt: Date | string | null
        cashConversionPoints: number
        cashConversionAmountUsd: number
        managerOwnedUserPointsEnabled?: boolean | null
    } | null
    rates: {
        userGlobalPointsPerThousand: number
        managerOwnedUserPointsPerThousand: number
        agentDefaultPointsPerThousand: number
        managerDefaultPointsPerThousand: number
    }
    agents: Array<{
        id: string
        username: string
        name?: string | null
        isActive: boolean
        overridePointsPerThousand: number | null
    }>
    managers: Array<{
        id: string
        username: string
        isActive: boolean
        overridePointsPerThousand: number | null
    }>
}

export function findDuplicateIds(ids: string[]): string[] {
    const seen = new Set<string>()
    const duplicates = new Set<string>()

    for (const id of ids) {
        if (seen.has(id)) {
            duplicates.add(id)
        } else {
            seen.add(id)
        }
    }

    return Array.from(duplicates)
}

export function normalizePointSettingsInput(input: unknown): NormalizePointSettingsResult {
    const parsed = pointSettingsInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            ok: false,
            error: 'Invalid points settings data',
            details: parsed.error.flatten(),
            duplicateAgentIds: [],
            duplicateManagerIds: [],
        }
    }

    const duplicateAgentIds = findDuplicateIds(parsed.data.agentOverrides.map((item) => item.agentId))
    const duplicateManagerIds = findDuplicateIds(parsed.data.managerOverrides.map((item) => item.managerId))

    if (duplicateAgentIds.length > 0 || duplicateManagerIds.length > 0) {
        return {
            ok: false,
            error: 'Duplicate override owners',
            duplicateAgentIds,
            duplicateManagerIds,
        }
    }

    return {
        ok: true,
        data: {
            pointsEnabled: parsed.data.pointsEnabled,
            pointsStartAt: parsed.data.pointsStartAt,
            cashConversionPoints: parsed.data.cashConversionPoints,
            cashConversionAmountUsd: parsed.data.cashConversionAmountUsd,
            userGlobalPointsPerThousand: parsed.data.userGlobalPointsPerThousand ?? parsed.data.userPointsPerThousand ?? 0,
            managerOwnedUserPointsEnabled: parsed.data.managerOwnedUserPointsEnabled,
            managerOwnedUserPointsPerThousand: parsed.data.managerOwnedUserPointsPerThousand,
            agentDefaultPointsPerThousand: parsed.data.agentDefaultPointsPerThousand ?? parsed.data.agentPointsPerThousand ?? 0,
            managerDefaultPointsPerThousand: parsed.data.managerDefaultPointsPerThousand ?? parsed.data.managerPointsPerThousand ?? 0,
            agentOverrides: parsed.data.agentOverrides,
            managerOverrides: parsed.data.managerOverrides,
        },
    }
}

function serializeDate(value: Date | string | null | undefined): string | null {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return value
}

export function buildPointSettingsResponse(input: PointSettingsResponseInput) {
    return {
        settings: {
            pointsEnabled: input.settings?.pointsEnabled ?? false,
            pointsStartAt: serializeDate(input.settings?.pointsStartAt),
            cashConversionPoints: input.settings?.cashConversionPoints ?? 0,
            cashConversionAmountUsd: input.settings?.cashConversionAmountUsd ?? 0,
            managerOwnedUserPointsEnabled: input.settings?.managerOwnedUserPointsEnabled ?? false,
        },
        defaults: {
            userGlobalPointsPerThousand: input.rates.userGlobalPointsPerThousand,
            managerOwnedUserPointsPerThousand: input.rates.managerOwnedUserPointsPerThousand,
            agentDefaultPointsPerThousand: input.rates.agentDefaultPointsPerThousand,
            managerDefaultPointsPerThousand: input.rates.managerDefaultPointsPerThousand,
        },
        agents: input.agents.map((agent) => ({
            id: agent.id,
            username: agent.username,
            name: agent.name || agent.username,
            isActive: agent.isActive,
            overridePointsPerThousand: agent.overridePointsPerThousand,
        })),
        managers: input.managers.map((manager) => ({
            id: manager.id,
            username: manager.username,
            isActive: manager.isActive,
            overridePointsPerThousand: manager.overridePointsPerThousand,
        })),
    }
}
