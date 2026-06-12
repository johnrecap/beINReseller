export const USER_BALANCE_SUMMARY_ROLES = ['USER', 'AGENT', 'MANAGER'] as const

type UserBalanceSummaryRole = (typeof USER_BALANCE_SUMMARY_ROLES)[number]

export function buildUserBalanceSummaryWhere(): {
    deletedAt: null
    role: { in: UserBalanceSummaryRole[] }
} {
    return {
        deletedAt: null,
        role: { in: [...USER_BALANCE_SUMMARY_ROLES] },
    }
}

export function formatUserBalanceSummary(balance: number | null | undefined, currency: string) {
    if (typeof balance !== 'number' || !Number.isFinite(balance)) {
        return null
    }

    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(balance)} ${currency}`
}
