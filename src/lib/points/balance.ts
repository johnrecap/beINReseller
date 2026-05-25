export type PointLedgerSummarySource =
    | 'OPERATION_SPEND'
    | 'EID_REWARD'
    | 'POINT_CASH_REDEMPTION'
    | 'POINT_REVERSAL'
    | 'CREDIT_REQUEST'
    | 'MANAGER_TOPUP'
    | 'REWARD_REDEMPTION'
    | 'ADMIN_RELEASE'
    | 'ADMIN_ADJUSTMENT'

export type PointLedgerSummaryStatus =
    | 'PENDING'
    | 'AVAILABLE'
    | 'REDEEMED'
    | 'CANCELLED'

export type PointLedgerSummaryEntry = {
    sourceType: PointLedgerSummarySource | string
    status: PointLedgerSummaryStatus | string
    points: number
}

export type SpendPointBalanceSummary = {
    available: number
    lifetimeEarned: number
    converted: number
    reversed: number
    legacy: number
}

const LEGACY_SOURCES = new Set([
    'CREDIT_REQUEST',
    'MANAGER_TOPUP',
    'REWARD_REDEMPTION',
    'ADMIN_RELEASE',
    'ADMIN_ADJUSTMENT',
])

function roundPoints(value: number): number {
    return Math.round(value * 10000) / 10000
}

export function summarizePointBalance(entries: PointLedgerSummaryEntry[]): SpendPointBalanceSummary {
    const summary: SpendPointBalanceSummary = {
        available: 0,
        lifetimeEarned: 0,
        converted: 0,
        reversed: 0,
        legacy: 0,
    }

    for (const entry of entries) {
        if (entry.status === 'CANCELLED') continue

        if ((entry.sourceType === 'OPERATION_SPEND' || entry.sourceType === 'EID_REWARD') && entry.points > 0) {
            summary.lifetimeEarned += entry.points
            summary.available += entry.points
            continue
        }

        if (entry.sourceType === 'POINT_CASH_REDEMPTION' && entry.points < 0) {
            const points = Math.abs(entry.points)
            summary.converted += points
            summary.available -= points
            continue
        }

        if (entry.sourceType === 'POINT_REVERSAL' && entry.points < 0) {
            const points = Math.abs(entry.points)
            summary.reversed += points
            summary.available -= points
            continue
        }

        if (LEGACY_SOURCES.has(entry.sourceType)) {
            summary.legacy += entry.points
        }
    }

    return {
        available: roundPoints(Math.max(0, summary.available)),
        lifetimeEarned: roundPoints(summary.lifetimeEarned),
        converted: roundPoints(summary.converted),
        reversed: roundPoints(summary.reversed),
        legacy: roundPoints(summary.legacy),
    }
}

export function getAvailableSpendPoints(entries: PointLedgerSummaryEntry[]): number {
    return summarizePointBalance(entries).available
}

export function groupPointSummariesByOwner(
    entries: Array<PointLedgerSummaryEntry & { ownerUserId: string }>
): Map<string, SpendPointBalanceSummary> {
    const grouped = new Map<string, PointLedgerSummaryEntry[]>()

    for (const entry of entries) {
        const ownerEntries = grouped.get(entry.ownerUserId) ?? []
        ownerEntries.push(entry)
        grouped.set(entry.ownerUserId, ownerEntries)
    }

    const summaries = new Map<string, SpendPointBalanceSummary>()
    for (const [ownerUserId, ownerEntries] of grouped) {
        summaries.set(ownerUserId, summarizePointBalance(ownerEntries))
    }

    return summaries
}

export function emptyPointSummary(): SpendPointBalanceSummary {
    return {
        available: 0,
        lifetimeEarned: 0,
        converted: 0,
        reversed: 0,
        legacy: 0,
    }
}
