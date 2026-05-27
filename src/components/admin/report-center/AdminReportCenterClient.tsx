'use client'

import { Component, type ComponentType, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, ExternalLink } from 'lucide-react'
import { ReportCenterTabs } from './ReportCenterTabs'
import {
    getVisibleReportCenterTabs,
    type ReportCenterTabKey,
    getReportCenterTab,
    resolveReportTabKey,
} from './report-tabs'
import { REPORT_PANEL_LOADERS } from './report-panel-loaders'

type AdminReportCenterClientProps = {
    initialTab?: string
}

function ReportPanelLoading() {
    return (
        <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            Loading report...
        </section>
    )
}

const REPORT_PANEL_COMPONENTS: Record<ReportCenterTabKey, ComponentType<object>> = {
    analytics: dynamic(REPORT_PANEL_LOADERS.analytics, { loading: ReportPanelLoading }),
    activity: dynamic(REPORT_PANEL_LOADERS.activity, { loading: ReportPanelLoading }),
    integrity: dynamic(REPORT_PANEL_LOADERS.integrity, { loading: ReportPanelLoading }),
    'bein-spend': dynamic(REPORT_PANEL_LOADERS['bein-spend'], { loading: ReportPanelLoading }),
    'points-analysis': dynamic(REPORT_PANEL_LOADERS['points-analysis'], { loading: ReportPanelLoading }),
    'login-monitor': dynamic(REPORT_PANEL_LOADERS['login-monitor'], { loading: ReportPanelLoading }),
    'balance-monitor': dynamic(REPORT_PANEL_LOADERS['balance-monitor'], { loading: ReportPanelLoading }),
    logs: dynamic(REPORT_PANEL_LOADERS.logs, { loading: ReportPanelLoading }),
}

class ReportPanelErrorBoundary extends Component<
    { resetKey: string; children: ReactNode },
    { hasError: boolean }
> {
    state = { hasError: false }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Report center panel failed', error, errorInfo)
    }

    componentDidUpdate(previousProps: { resetKey: string }) {
        if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false })
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
                    This report failed to load. Choose another tab or refresh the page.
                </section>
            )
        }

        return this.props.children
    }
}

function ActivePanel({ tabKey }: { tabKey: ReportCenterTabKey }) {
    const Panel = REPORT_PANEL_COMPONENTS[tabKey] ?? REPORT_PANEL_COMPONENTS.analytics

    return (
        <ReportPanelErrorBoundary resetKey={tabKey}>
            <Panel />
        </ReportPanelErrorBoundary>
    )
}

export default function AdminReportCenterClient({ initialTab }: AdminReportCenterClientProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [sidebarSettings, setSidebarSettings] = useState<Record<string, boolean>>({
        sidebar_show_login_failures: true,
        sidebar_show_low_balance: true,
    })
    const visibleTabs = useMemo(() => getVisibleReportCenterTabs(sidebarSettings), [sidebarSettings])
    const [activeTab, setActiveTab] = useState<ReportCenterTabKey>(() => resolveReportTabKey(initialTab))
    const activeTabDetails = useMemo(() => getReportCenterTab(activeTab), [activeTab])

    useEffect(() => {
        fetch('/api/admin/sidebar-settings')
            .then((res) => res.json())
            .then((data) => setSidebarSettings(data))
            .catch(() => { /* keep defaults */ })
    }, [])

    useEffect(() => {
        const resolvedTab = resolveReportTabKey(activeTab, visibleTabs)
        if (resolvedTab !== activeTab) {
            setActiveTab(resolvedTab)
            router.replace(`${pathname}?tab=${encodeURIComponent(resolvedTab)}`, { scroll: false })
        }
    }, [activeTab, pathname, router, visibleTabs])

    function handleTabChange(nextTab: ReportCenterTabKey) {
        const resolvedTab = resolveReportTabKey(nextTab, visibleTabs)
        setActiveTab(resolvedTab)
        router.replace(`${pathname}?tab=${encodeURIComponent(resolvedTab)}`, { scroll: false })
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
                    <Link
                        href={activeTabDetails.legacyHref}
                        className="mt-2 flex items-center gap-2 text-primary hover:text-primary/80"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open full page
                    </Link>
                </div>
            </header>

            <ReportCenterTabs
                activeTab={activeTab}
                tabs={visibleTabs}
                onTabChange={handleTabChange}
            />

            <ActivePanel tabKey={activeTab} />
        </div>
    )
}
