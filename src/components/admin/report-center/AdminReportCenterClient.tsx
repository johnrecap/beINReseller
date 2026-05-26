'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { ReportCenterTabs } from './ReportCenterTabs'
import {
    REPORT_CENTER_TABS,
    type ReportCenterTabKey,
    getReportCenterTab,
    resolveReportTabKey,
} from './report-tabs'
import AnalyticsReportPanel from './AnalyticsReportPanel'
import ActivityReportPanel from './ActivityReportPanel'
import IntegrityReportPanel from './IntegrityReportPanel'
import BeinSpendReportPanel from './BeinSpendReportPanel'
import LoginMonitorPanel from './LoginMonitorPanel'
import BalanceMonitorPanel from './BalanceMonitorPanel'
import LogsReportPanel from './LogsReportPanel'

type AdminReportCenterClientProps = {
    initialTab?: string
}

function ActivePanel({ tabKey }: { tabKey: ReportCenterTabKey }) {
    if (tabKey === 'activity') return <ActivityReportPanel />
    if (tabKey === 'integrity') return <IntegrityReportPanel />
    if (tabKey === 'bein-spend') return <BeinSpendReportPanel />
    if (tabKey === 'login-monitor') return <LoginMonitorPanel />
    if (tabKey === 'balance-monitor') return <BalanceMonitorPanel />
    if (tabKey === 'logs') return <LogsReportPanel />

    return <AnalyticsReportPanel />
}

export default function AdminReportCenterClient({ initialTab }: AdminReportCenterClientProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [activeTab, setActiveTab] = useState<ReportCenterTabKey>(() => resolveReportTabKey(initialTab))
    const activeTabDetails = useMemo(() => getReportCenterTab(activeTab), [activeTab])

    function handleTabChange(nextTab: ReportCenterTabKey) {
        setActiveTab(nextTab)
        router.replace(`${pathname}?tab=${encodeURIComponent(nextTab)}`, { scroll: false })
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Admin reporting</p>
                    <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
                        <BarChart3 className="h-7 w-7 text-primary" />
                        Reports Center
                    </h1>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Analytics, monitoring, spend reports, account health, and logs in one workspace.
                    </p>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    Active: <span className="font-medium text-foreground">{activeTabDetails.label}</span>
                </div>
            </header>

            <ReportCenterTabs
                activeTab={activeTab}
                tabs={REPORT_CENTER_TABS}
                onTabChange={handleTabChange}
            />

            <ActivePanel tabKey={activeTab} />
        </div>
    )
}
