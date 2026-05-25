import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import {
    DEFAULT_EID_AFTER_TEXT,
    DEFAULT_EID_BEFORE_TEXT,
    EID_REWARD_SETTINGS_ID,
} from '@/lib/eid-rewards/calculation'

const nullableDateTime = z.union([z.string().datetime(), z.null()])

export const eidRewardTierSchema = z.object({
    id: z.string().optional(),
    points: z.number().int().min(1).max(1_000_000),
    probabilityWeight: z.number().int().min(1).max(1_000_000),
    label: z.string().trim().max(80).nullable().optional(),
    isActive: z.boolean().default(true),
})

export const eidRewardSettingsSchema = z.object({
    enabled: z.boolean().default(false),
    eventKey: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
    startsAt: nullableDateTime,
    endsAt: nullableDateTime,
    claimPolicy: z.enum(['ONCE_PER_EVENT', 'ONCE_PER_DAY']),
    minPoints: z.number().int().min(1).max(1_000_000),
    maxPoints: z.number().int().min(1).max(1_000_000),
    minRedeemPoints: z.number().int().min(1).max(1_000_000),
    showPopupAfterLogin: z.boolean().default(true),
    allowLaterDismiss: z.boolean().default(true),
    closeDelaySeconds: z.number().int().min(0).max(30),
    beforeText: z.string().trim().min(1).max(600),
    afterText: z.string().trim().min(1).max(600),
    tiers: z.array(eidRewardTierSchema).max(20).default([]),
}).superRefine((value, ctx) => {
    if (value.minPoints > value.maxPoints) {
        ctx.addIssue({
            code: 'custom',
            path: ['minPoints'],
            message: 'minPoints must be less than or equal to maxPoints',
        })
    }

    if (value.enabled) {
        if (!value.startsAt) {
            ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'startsAt is required when enabled' })
        }
        if (!value.endsAt) {
            ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endsAt is required when enabled' })
        }
    }

    if (value.startsAt && value.endsAt && new Date(value.startsAt).getTime() >= new Date(value.endsAt).getTime()) {
        ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endsAt must be after startsAt' })
    }
})

export type EidRewardSettingsInput = z.infer<typeof eidRewardSettingsSchema>

export type EidRewardSettingsReader = Pick<Prisma.TransactionClient, 'eidRewardSettings' | 'eidRewardTier'>

export async function getEidRewardSettings(db: EidRewardSettingsReader) {
    const settings = await db.eidRewardSettings.findUnique({
        where: { id: EID_REWARD_SETTINGS_ID },
        include: { tiers: { orderBy: { createdAt: 'asc' } } },
    })

    return settings ?? {
        id: EID_REWARD_SETTINGS_ID,
        enabled: false,
        eventKey: 'eid-default',
        startsAt: null,
        endsAt: null,
        claimPolicy: 'ONCE_PER_EVENT' as const,
        minPoints: 50,
        maxPoints: 500,
        minRedeemPoints: 1,
        showPopupAfterLogin: true,
        allowLaterDismiss: true,
        closeDelaySeconds: 0,
        beforeText: DEFAULT_EID_BEFORE_TEXT,
        afterText: DEFAULT_EID_AFTER_TEXT,
        updatedByAdminId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        tiers: [],
    }
}

export function serializeEidSettings(settings: Awaited<ReturnType<typeof getEidRewardSettings>>) {
    return {
        id: settings.id,
        enabled: settings.enabled,
        eventKey: settings.eventKey,
        startsAt: settings.startsAt?.toISOString() ?? null,
        endsAt: settings.endsAt?.toISOString() ?? null,
        claimPolicy: settings.claimPolicy,
        minPoints: settings.minPoints,
        maxPoints: settings.maxPoints,
        minRedeemPoints: settings.minRedeemPoints,
        showPopupAfterLogin: settings.showPopupAfterLogin,
        allowLaterDismiss: settings.allowLaterDismiss,
        closeDelaySeconds: settings.closeDelaySeconds,
        beforeText: settings.beforeText,
        afterText: settings.afterText,
        updatedAt: settings.updatedAt.toISOString(),
    }
}
