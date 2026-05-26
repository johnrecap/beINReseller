import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildReportCenterHref,
    DEFAULT_REPORT_TAB_KEY,
    REPORT_CENTER_HREF,
    REPORT_CENTER_TABS,
    resolveReportTabKey,
} from '@/components/admin/report-center/report-tabs'

const REQUIRED_TAB_KEYS = [
    'analytics',
    'activity',
    'integrity',
    'bein-spend',
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
    assert.equal(resolveReportTabKey('missing'), DEFAULT_REPORT_TAB_KEY)
})

test('report center builds stable deep links for tab keys', () => {
    assert.equal(buildReportCenterHref('analytics'), '/dashboard/admin/reports?tab=analytics')
    assert.equal(buildReportCenterHref('bein-spend'), '/dashboard/admin/reports?tab=bein-spend')
    assert.equal(buildReportCenterHref('missing'), '/dashboard/admin/reports?tab=analytics')
})
