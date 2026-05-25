import { randomInt } from 'node:crypto'
import { calculateCashConversion, roundMoney } from '@/lib/points/calculation'
import { getConversionReadiness, type PointProgramSettingsSnapshot } from '@/lib/points/settings'

export type EidRewardClaimPolicyValue = 'ONCE_PER_EVENT' | 'ONCE_PER_DAY'

export type RewardTierLike = {
    points: number
    probabilityWeight: number
    isActive: boolean
}

export const EID_REWARD_SETTINGS_ID = 'default'
export const DEFAULT_EID_BEFORE_TEXT = 'عيديتك جاهزة! افتح الظرف واحصل على نقاط عشوائية تقدر تحولها لرصيد داخل حسابك.'
export const DEFAULT_EID_AFTER_TEXT = 'يمكنك تحويل نقاطك إلى رصيد داخل الموقع.'
export const DEFAULT_CURRENCY_LABEL = 'USD'

export function secureRandomIntInclusive(min: number, max: number): number {
    return randomInt(min, max + 1)
}

export function selectWeightedReward(
    tiers: RewardTierLike[],
    pick: (min: number, max: number) => number = secureRandomIntInclusive
): number | null {
    const activeTiers = tiers.filter((tier) =>
        tier.isActive
        && Number.isInteger(tier.points)
        && tier.points > 0
        && Number.isInteger(tier.probabilityWeight)
        && tier.probabilityWeight > 0
    )
    const totalWeight = activeTiers.reduce((sum, tier) => sum + tier.probabilityWeight, 0)
    if (totalWeight <= 0) return null

    const selected = pick(1, totalWeight)
    let cursor = 0
    for (const tier of activeTiers) {
        cursor += tier.probabilityWeight
        if (selected <= cursor) return tier.points
    }

    return activeTiers[activeTiers.length - 1]?.points ?? null
}

export function selectRangeReward(
    minPoints: number,
    maxPoints: number,
    pick: (min: number, max: number) => number = secureRandomIntInclusive
): number {
    const min = Math.ceil(minPoints)
    const max = Math.floor(maxPoints)
    if (min <= 0 || max < min) {
        throw new Error('INVALID_POINT_RANGE')
    }
    return pick(min, max)
}

export function buildCairoClaimDate(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now)

    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value
    if (!year || !month || !day) {
        throw new Error('INVALID_CAIRO_DATE')
    }

    return `${year}-${month}-${day}`
}

export function buildClaimScopeKey(
    eventKey: string,
    claimPolicy: EidRewardClaimPolicyValue,
    now = new Date()
): string {
    if (claimPolicy === 'ONCE_PER_DAY') {
        return `${eventKey}:${buildCairoClaimDate(now)}`
    }

    return eventKey
}

export function isEidEventActive(
    settings: { enabled: boolean; startsAt: Date | null; endsAt: Date | null },
    now = new Date()
): boolean {
    if (!settings.enabled || !settings.startsAt || !settings.endsAt) return false
    return settings.startsAt.getTime() <= now.getTime() && settings.endsAt.getTime() >= now.getTime()
}

export function calculateEidMoneyPreview(
    points: number,
    settings: PointProgramSettingsSnapshot
): number | null {
    if (!getConversionReadiness(settings).ok) return null
    const conversion = calculateCashConversion({
        pointsToConvert: points,
        conversionPoints: settings.cashConversionPoints,
        conversionAmountUsd: settings.cashConversionAmountUsd,
        availablePoints: points,
    })

    return conversion.ok ? roundMoney(conversion.balanceAmountUsd) : null
}
