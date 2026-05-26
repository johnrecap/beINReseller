export const REPORT_CENTER_HREF = '/dashboard/admin/reports'

export const DEFAULT_REPORT_TAB_KEY = 'analytics'

export const REPORT_CENTER_TABS = [
    {
        key: 'analytics',
        label: 'Analytics',
        description: 'Operations analytics and dashboard trends',
        legacyHref: '/dashboard/admin/analytics',
    },
    {
        key: 'activity',
        label: 'Activity Monitoring',
        description: 'User activity and inactivity monitoring',
        legacyHref: '/dashboard/admin/users/activity',
    },
    {
        key: 'integrity',
        label: 'Integrity Reports',
        description: 'Operation integrity review and recovery checks',
        legacyHref: '/dashboard/admin/reports/integrity',
    },
    {
        key: 'bein-spend',
        label: 'beIN Spend Report',
        description: 'beIN spend ledger and operation charge reports',
        legacyHref: '/dashboard/admin/reports/bein-spend',
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
    },
] as const

export type ReportCenterTab = (typeof REPORT_CENTER_TABS)[number]
export type ReportCenterTabKey = ReportCenterTab['key']

const REPORT_TAB_KEYS = new Set<string>(
    REPORT_CENTER_TABS.map((tab) => tab.key)
)

export function resolveReportTabKey(value: unknown): ReportCenterTabKey {
    if (typeof value !== 'string') {
        return DEFAULT_REPORT_TAB_KEY
    }

    if (REPORT_TAB_KEYS.has(value)) {
        return value as ReportCenterTabKey
    }

    return DEFAULT_REPORT_TAB_KEY
}

export function buildReportCenterHref(value: unknown): string {
    const tabKey = resolveReportTabKey(value)
    return `${REPORT_CENTER_HREF}?tab=${encodeURIComponent(tabKey)}`
}

export function getReportCenterTab(value: unknown): ReportCenterTab {
    const tabKey = resolveReportTabKey(value)
    return REPORT_CENTER_TABS.find((tab) => tab.key === tabKey) ?? REPORT_CENTER_TABS[0]
}
