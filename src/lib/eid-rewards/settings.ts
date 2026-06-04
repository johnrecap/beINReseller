import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import {
    DEFAULT_EID_AFTER_TEXT,
    DEFAULT_EID_BEFORE_TEXT,
    EID_REWARD_SETTINGS_ID,
} from '@/lib/eid-rewards/calculation'
import {
    DEFAULT_EID_AUDIENCE_ROLES,
    isEidAudienceRole,
    normalizeEidAudienceRoles,
} from '@/lib/eid-rewards/audience'

const nullableDateTime = z.union([z.string().datetime(), z.null()])
const roleSchema = z.enum(DEFAULT_EID_AUDIENCE_ROLES)
const overrideEffectSchema = z.enum(['ALLOW', 'DENY'])

export const DEFAULT_EID_POPUP_TEXTS = {
    title: '\u0639\u064a\u062f \u0645\u0628\u0627\u0631\u0643',
    beforeText: DEFAULT_EID_BEFORE_TEXT,
    openButtonText: '\u0627\u0641\u062a\u062d \u0627\u0644\u0639\u064a\u062f\u064a\u0629 \u0627\u0644\u0622\u0646',
    openingText: '\u062c\u0627\u0631\u064a \u0641\u062a\u062d \u0627\u0644\u0639\u064a\u062f\u064a\u0629...',
    successTitle: '\u0645\u0628\u0631\u0648\u0643!',
    pointsText: '\u062d\u0635\u0644\u062a \u0639\u0644\u0649 {points} \u0646\u0642\u0637\u0629',
    moneyPreviewText: '\u062a\u0639\u0627\u062f\u0644 {amount} {currency} \u0631\u0635\u064a\u062f',
    afterText: DEFAULT_EID_AFTER_TEXT,
    redeemButtonText: '\u062a\u062d\u0648\u064a\u0644 \u0627\u0644\u0646\u0642\u0627\u0637 \u0625\u0644\u0649 \u0631\u0635\u064a\u062f',
    redeemingText: '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0648\u064a\u0644...',
    redeemedSuccessText: '\u062a\u0645 \u062a\u062d\u0648\u064a\u0644 \u0627\u0644\u0646\u0642\u0627\u0637 \u0625\u0644\u0649 \u0631\u0635\u064a\u062f \u0628\u0646\u062c\u0627\u062d.',
    laterButtonText: '\u0644\u0627\u062d\u0642\u0627',
    alreadyClaimedText: '\u0627\u0633\u062a\u0644\u0645\u062a \u0639\u064a\u062f\u064a\u062a\u0643 \u0628\u0627\u0644\u0641\u0639\u0644',
    claimedTodayText: '\u0627\u0633\u062a\u0644\u0645\u062a \u0639\u064a\u062f\u064a\u062a\u0643 \u0627\u0644\u064a\u0648\u0645\u060c \u0627\u0631\u062c\u0639 \u0628\u0643\u0631\u0629 \u0644\u0639\u064a\u062f\u064a\u0629 \u062c\u062f\u064a\u062f\u0629',
    inactiveEventText: '\u0627\u0646\u062a\u0647\u062a \u0639\u0631\u0648\u0636 \u0627\u0644\u0639\u064a\u062f\u060c \u062a\u0627\u0628\u0639\u0646\u0627 \u0641\u064a \u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0627\u062a \u0627\u0644\u0642\u0627\u062f\u0645\u0629.',
    genericErrorText: '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0641\u062a\u062d \u0627\u0644\u0639\u064a\u062f\u064a\u0629\u060c \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
} as const

type PopupTextKey = keyof typeof DEFAULT_EID_POPUP_TEXTS

const popupTextLimits: Record<PopupTextKey, number> = {
    title: 160,
    beforeText: 600,
    openButtonText: 160,
    openingText: 160,
    successTitle: 160,
    pointsText: 160,
    moneyPreviewText: 160,
    afterText: 600,
    redeemButtonText: 160,
    redeemingText: 160,
    redeemedSuccessText: 160,
    laterButtonText: 160,
    alreadyClaimedText: 240,
    claimedTodayText: 240,
    inactiveEventText: 240,
    genericErrorText: 240,
}

const allowedPlaceholders: Partial<Record<PopupTextKey, string[]>> = {
    pointsText: ['points'],
    moneyPreviewText: ['amount', 'currency'],
}

function popupTextField(key: PopupTextKey) {
    return z.string().trim().min(1).max(popupTextLimits[key]).superRefine((value, ctx) => {
        const matches = value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []
        const allowed = allowedPlaceholders[key] ?? []
        for (const match of matches) {
            const placeholder = match.slice(1, -1)
            if (!allowed.includes(placeholder)) {
                ctx.addIssue({
                    code: 'custom',
                    message: `Unsupported placeholder ${match}`,
                })
            }
        }
    })
}

export const eidRewardPopupTextsSchema = z.object({
    title: popupTextField('title'),
    beforeText: popupTextField('beforeText'),
    openButtonText: popupTextField('openButtonText'),
    openingText: popupTextField('openingText'),
    successTitle: popupTextField('successTitle'),
    pointsText: popupTextField('pointsText'),
    moneyPreviewText: popupTextField('moneyPreviewText'),
    afterText: popupTextField('afterText'),
    redeemButtonText: popupTextField('redeemButtonText'),
    redeemingText: popupTextField('redeemingText'),
    redeemedSuccessText: popupTextField('redeemedSuccessText'),
    laterButtonText: popupTextField('laterButtonText'),
    alreadyClaimedText: popupTextField('alreadyClaimedText'),
    claimedTodayText: popupTextField('claimedTodayText'),
    inactiveEventText: popupTextField('inactiveEventText'),
    genericErrorText: popupTextField('genericErrorText'),
})

export type EidRewardPopupTexts = z.infer<typeof eidRewardPopupTextsSchema>

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
    audienceRoles: z.array(roleSchema).max(DEFAULT_EID_AUDIENCE_ROLES.length).default([...DEFAULT_EID_AUDIENCE_ROLES]),
    popupTexts: eidRewardPopupTextsSchema.optional(),
    audienceOverrides: z.array(z.object({
        userId: z.string().trim().min(1),
        effect: overrideEffectSchema,
    })).max(500).default([]),
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

    const seenOverrideUsers = new Set<string>()
    value.audienceOverrides.forEach((override, index) => {
        if (seenOverrideUsers.has(override.userId)) {
            ctx.addIssue({
                code: 'custom',
                path: ['audienceOverrides', index, 'userId'],
                message: 'Duplicate audience override user',
            })
        }
        seenOverrideUsers.add(override.userId)
    })
})

export type EidRewardSettingsInput = z.infer<typeof eidRewardSettingsSchema>

export type EidRewardSettingsReader = Pick<Prisma.TransactionClient, 'eidRewardSettings' | 'eidRewardTier'>

export function normalizeEidPopupTexts(input: {
    popupTexts: unknown
    beforeText: string
    afterText: string
}): EidRewardPopupTexts {
    const defaults = {
        ...DEFAULT_EID_POPUP_TEXTS,
        beforeText: input.beforeText?.trim() || DEFAULT_EID_BEFORE_TEXT,
        afterText: input.afterText?.trim() || DEFAULT_EID_AFTER_TEXT,
    }

    const candidate = input.popupTexts && typeof input.popupTexts === 'object'
        ? { ...defaults, ...(input.popupTexts as Record<string, unknown>) }
        : defaults
    const parsed = eidRewardPopupTextsSchema.safeParse(candidate)

    return parsed.success ? parsed.data : defaults
}

export function formatEidPopupText(
    template: string,
    values: { points?: number; amount?: number | string; currency?: string }
) {
    return template
        .replaceAll('{points}', values.points == null ? '' : String(values.points))
        .replaceAll('{amount}', values.amount == null ? '' : String(values.amount))
        .replaceAll('{currency}', values.currency ?? '')
}

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
        audienceRoles: [...DEFAULT_EID_AUDIENCE_ROLES],
        popupTexts: DEFAULT_EID_POPUP_TEXTS,
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
        audienceRoles: normalizeEidAudienceRoles(settings.audienceRoles),
        popupTexts: normalizeEidPopupTexts({
            popupTexts: settings.popupTexts,
            beforeText: settings.beforeText,
            afterText: settings.afterText,
        }),
        updatedAt: settings.updatedAt.toISOString(),
    }
}

export function normalizeEidSettingsInput(input: EidRewardSettingsInput) {
    const popupTexts = normalizeEidPopupTexts({
        popupTexts: input.popupTexts,
        beforeText: input.beforeText,
        afterText: input.afterText,
    })

    return {
        ...input,
        audienceRoles: input.audienceRoles.filter(isEidAudienceRole),
        beforeText: popupTexts.beforeText,
        afterText: popupTexts.afterText,
        popupTexts,
    }
}

export function buildEidRewardSettingsPersistence(
    input: EidRewardSettingsInput,
    options: {
        adminUserId: string
        startsAt: Date | null
        endsAt: Date | null
    }
) {
    const normalized = normalizeEidSettingsInput(input)

    return {
        settingsData: {
            id: EID_REWARD_SETTINGS_ID,
            enabled: normalized.enabled,
            eventKey: normalized.eventKey,
            startsAt: options.startsAt,
            endsAt: options.endsAt,
            claimPolicy: normalized.claimPolicy,
            minPoints: normalized.minPoints,
            maxPoints: normalized.maxPoints,
            minRedeemPoints: normalized.minRedeemPoints,
            showPopupAfterLogin: normalized.showPopupAfterLogin,
            allowLaterDismiss: normalized.allowLaterDismiss,
            closeDelaySeconds: normalized.closeDelaySeconds,
            beforeText: normalized.beforeText,
            afterText: normalized.afterText,
            audienceRoles: normalized.audienceRoles,
            popupTexts: normalized.popupTexts,
            updatedByAdminId: options.adminUserId,
        },
        tiers: normalized.tiers.map((tier) => ({
            settingsId: EID_REWARD_SETTINGS_ID,
            points: tier.points,
            probabilityWeight: tier.probabilityWeight,
            label: tier.label?.trim() || null,
            isActive: tier.isActive,
        })),
        audienceOverrides: normalized.audienceOverrides.map((override) => ({
            settingsId: EID_REWARD_SETTINGS_ID,
            userId: override.userId,
            effect: override.effect,
        })),
    }
}
