import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildReportCenterHref,
    DEFAULT_REPORT_TAB_KEY,
    REPORT_CENTER_HREF,
    REPORT_CENTER_TABS,
    getVisibleReportCenterTabs,
    resolveReportTabKey,
} from '@/components/admin/report-center/report-tabs'
import { getReportPanelLoader, type ReportPanelLoaderMap } from '@/components/admin/report-center/report-panel-loaders'

const REQUIRED_TAB_KEYS = [
    'analytics',
    'activity',
    'integrity',
    'bein-spend',
    'points-analysis',
    'credit-payments',
    'balance-movements',
    'login-monitor',
    'balance-monitor',
    'logs',
]

test('report center registry exposes all required report tabs once', () => {
    const keys = REPORT_CENTER_TABS.map((tab) => tab.key)

    assert.deepEqual(keys, REQUIRED_TAB_KEYS)
    assert.equal(new Set(keys).size, keys.length)
})

test('report center tabs keep stable legacy routes', () => {
    const legacyRoutes = Object.fromEntries(
        REPORT_CENTER_TABS.map((tab) => [tab.key, tab.legacyHref])
    )

    assert.deepEqual(legacyRoutes, {
        analytics: '/dashboard/admin/analytics',
        activity: '/dashboard/admin/users/activity',
        integrity: '/dashboard/admin/reports/integrity',
        'bein-spend': '/dashboard/admin/reports/bein-spend',
        'points-analysis': '/dashboard/admin/reports?tab=points-analysis',
        'credit-payments': '/dashboard/admin/reports?tab=credit-payments',
        'balance-movements': '/dashboard/admin/reports?tab=balance-movements',
        'login-monitor': '/dashboard/admin/bein-accounts/login-failures',
        'balance-monitor': '/dashboard/admin/bein-accounts/low-balance',
        logs: '/dashboard/admin/logs',
    })
})

test('report center resolves unknown tab values to the default tab', () => {
    assert.equal(REPORT_CENTER_HREF, '/dashboard/admin/reports')
    assert.equal(DEFAULT_REPORT_TAB_KEY, 'analytics')
    assert.equal(resolveReportTabKey('analytics'), 'analytics')
    assert.equal(resolveReportTabKey('bein-spend'), 'bein-spend')
    assert.equal(resolveReportTabKey('points-analysis'), 'points-analysis')
    assert.equal(resolveReportTabKey('credit-payments'), 'credit-payments')
    assert.equal(resolveReportTabKey('balance-movements'), 'balance-movements')
    assert.equal(resolveReportTabKey('missing'), DEFAULT_REPORT_TAB_KEY)
})

test('report center builds stable deep links for tab keys', () => {
    assert.equal(buildReportCenterHref('analytics'), '/dashboard/admin/reports?tab=analytics')
    assert.equal(buildReportCenterHref('bein-spend'), '/dashboard/admin/reports?tab=bein-spend')
    assert.equal(buildReportCenterHref('points-analysis'), '/dashboard/admin/reports?tab=points-analysis')
    assert.equal(buildReportCenterHref('credit-payments'), '/dashboard/admin/reports?tab=credit-payments')
    assert.equal(buildReportCenterHref('balance-movements'), '/dashboard/admin/reports?tab=balance-movements')
    assert.equal(buildReportCenterHref('missing'), '/dashboard/admin/reports?tab=analytics')
})

test('report center resolves tab values against visible tabs', () => {
    const visibleTabs = getVisibleReportCenterTabs({
        sidebar_show_login_failures: false,
        sidebar_show_low_balance: true,
    })

    assert.equal(visibleTabs.some((tab) => tab.key === 'login-monitor'), false)
    assert.equal(visibleTabs.some((tab) => tab.key === 'balance-monitor'), true)
    assert.equal(resolveReportTabKey('login-monitor', visibleTabs), DEFAULT_REPORT_TAB_KEY)
    assert.equal(resolveReportTabKey('balance-monitor', visibleTabs), 'balance-monitor')
})

test('report center panel modules are importable', async () => {
    const modules = await Promise.all([
        import('../../src/components/admin/report-center/AnalyticsReportPanel'),
        import('../../src/components/admin/report-center/ActivityReportPanel'),
        import('../../src/components/admin/report-center/IntegrityReportPanel'),
        import('../../src/components/admin/report-center/BeinSpendReportPanel'),
        import('../../src/components/admin/report-center/PointsAnalysisReportPanel'),
        import('../../src/components/admin/report-center/CreditPaymentsReportPanel'),
        import('../../src/components/admin/report-center/BalanceMovementsReportPanel'),
        import('../../src/components/admin/report-center/LoginMonitorPanel'),
        import('../../src/components/admin/report-center/BalanceMonitorPanel'),
        import('../../src/components/admin/report-center/LogsReportPanel'),
    ])

    for (const panelModule of modules) {
        assert.equal(typeof panelModule.default, 'function')
    }
})

test('report center selects only the active panel loader', async () => {
    const calls: string[] = []
    const makeLoader = (key: string) => async () => {
        calls.push(key)
        return { default: () => null }
    }
    const loaders = Object.fromEntries(
        REQUIRED_TAB_KEYS.map((key) => [key, makeLoader(key)])
    ) as unknown as ReportPanelLoaderMap

    await getReportPanelLoader('bein-spend', loaders)()

    assert.deepEqual(calls, ['bein-spend'])
})
