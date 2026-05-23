export type PointBalanceSummary = {
    pending: number
    available: number
    redeemed: number
    cancelled: number
    availableToSpend: number
}

export type PointLedgerLike = {
    points: number
    status: 'PENDING' | 'AVAILABLE' | 'REDEEMED' | 'CANCELLED'
}

export type RewardRedemptionValidation = {
    ok: boolean
    reason?: 'REWARD_INACTIVE' | 'INSUFFICIENT_POINTS' | 'INVALID_COST'
}

export function summarizePointBalance(entries: PointLedgerLike[]): PointBalanceSummary {
    return entries.reduce<PointBalanceSummary>(
        (summary, entry) => {
            summary[entry.status.toLowerCase() as keyof PointBalanceSummary] += entry.points
            summary.availableToSpend = summary.available + summary.redeemed
            return summary
        },
        { pending: 0, available: 0, redeemed: 0, cancelled: 0, availableToSpend: 0 }
    )
}

export function getAvailablePoints(entries: PointLedgerLike[]): number {
    return Math.max(0, summarizePointBalance(entries).availableToSpend)
}

export function validateRewardRedemption(input: {
    rewardIsActive: boolean
    pointsCost: number
    availablePoints: number
}): RewardRedemptionValidation {
    if (!input.rewardIsActive) {
        return { ok: false, reason: 'REWARD_INACTIVE' }
    }

    if (!Number.isFinite(input.pointsCost) || input.pointsCost <= 0) {
        return { ok: false, reason: 'INVALID_COST' }
    }

    if (input.availablePoints < input.pointsCost) {
        return { ok: false, reason: 'INSUFFICIENT_POINTS' }
    }

    return { ok: true }
}
