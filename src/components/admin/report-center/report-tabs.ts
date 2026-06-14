export const REPORT_CENTER_HREF = '/dashboard/admin/reports'

export const DEFAULT_REPORT_TAB_KEY = 'analytics'

export type ReportCenterVisibilitySetting = 'sidebar_show_login_failures' | 'sidebar_show_low_balance'

type ReportCenterTabDefinition = {
    key: string
    label: string
    description: string
    legacyHref: string
    visibilitySetting?: ReportCenterVisibilitySetting
}

export const REPORT_CENTER_TABS = [
    {
        key: 'analytics',
        label: 'Analytics',
        description: 'Operations analytics and dashboard trends',
        legacyHref: '/dashboard/admin/analytics',
        visibilitySetting: undefined,
    },
    {
        key: 'activity',
        label: 'Activity Monitoring',
        description: 'User activity and inactivity monitoring',
        legacyHref: '/dashboard/admin/users/activity',
        visibilitySetting: undefined,
    },
    {
        key: 'integrity',
        label: 'Integrity Reports',
        description: 'Operation integrity review and recovery checks',
        legacyHref: '/dashboard/admin/reports/integrity',
        visibilitySetting: undefined,
    },
    {
        key: 'bein-spend',
        label: 'beIN Spend Report',
        description: 'beIN spend ledger and operation charge reports',
        legacyHref: '/dashboard/admin/reports/bein-spend',
        visibilitySetting: undefined,
    },
    {
        key: 'points-analysis',
        label: 'Points Analysis',
        description: 'Trace point sources, conversions, reversals, and owner balances',
        legacyHref: '/dashboard/admin/reports?tab=points-analysis',
        visibilitySetting: undefined,
    },
    {
        key: 'credit-payments',
        label: 'Credit Payments',
        description: 'Recorded user debt payments by admins and agents',
        legacyHref: '/dashboard/admin/reports?tab=credit-payments',
        visibilitySetting: undefined,
    },
    {
        key: 'login-monitor',
        label: 'Account Login Monitor',
        description: 'beIN account login failure monitoring',
        legacyHref: '/dashboard/admin/bein-accounts/login-failures',
        visibilitySetting: 'sidebar_show_login_failures',
    },
    {
        key: 'balance-monitor',
        label: 'Balance Alert Monitor',
        description: 'beIN account low balance monitoring',
        legacyHref: '/dashboard/admin/bein-accounts/low-balance',
        visibilitySetting: 'sidebar_show_low_balance',
    },
    {
        key: 'logs',
        label: 'Activity Logs',
        description: 'Admin and system activity logs',
        legacyHref: '/dashboard/admin/logs',
        visibilitySetting: undefined,
    },
] as const satisfies readonly ReportCenterTabDefinition[]

export type ReportCenterTab = (typeof REPORT_CENTER_TABS)[number]
export type ReportCenterTabKey = (typeof REPORT_CENTER_TABS)[number]['key']

const REPORT_TAB_KEYS = new Set<string>(
    REPORT_CENTER_TABS.map((tab) => tab.key)
)

export type ReportCenterVisibilitySettings = Partial<Record<ReportCenterVisibilitySetting, boolean>>

export function getVisibleReportCenterTabs(settings: ReportCenterVisibilitySettings = {}): ReportCenterTab[] {
    return REPORT_CENTER_TABS.filter((tab) => {
        if (!tab.visibilitySetting) return true
        return settings[tab.visibilitySetting] !== false
    })
}

export function resolveReportTabKey(
    value: unknown,
    visibleTabs: readonly ReportCenterTab[] = REPORT_CENTER_TABS
): ReportCenterTabKey {
    if (typeof value !== 'string') {
        return DEFAULT_REPORT_TAB_KEY
    }

    const visibleKeys = new Set(visibleTabs.map((tab) => tab.key))

    if (REPORT_TAB_KEYS.has(value) && visibleKeys.has(value as ReportCenterTabKey)) {
        return value as ReportCenterTabKey
    }

    return visibleTabs[0]?.key ?? DEFAULT_REPORT_TAB_KEY
}

export function buildReportCenterHref(value: unknown): string {
    const tabKey = resolveReportTabKey(value)
    return `${REPORT_CENTER_HREF}?tab=${encodeURIComponent(tabKey)}`
}

export function getReportCenterTab(value: unknown): ReportCenterTab {
    const tabKey = resolveReportTabKey(value)
    return REPORT_CENTER_TABS.find((tab) => tab.key === tabKey) ?? REPORT_CENTER_TABS[0]
}
