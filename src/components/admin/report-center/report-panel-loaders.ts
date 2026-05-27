import type { ComponentType } from 'react'
import type { ReportCenterTabKey } from './report-tabs'

export type ReportPanelComponent = ComponentType
export type ReportPanelLoader = () => Promise<{ default: ReportPanelComponent }>
export type ReportPanelLoaderMap = Record<ReportCenterTabKey, ReportPanelLoader>

export const REPORT_PANEL_LOADERS: ReportPanelLoaderMap = {
    analytics: () => import('./AnalyticsReportPanel'),
    activity: () => import('./ActivityReportPanel'),
    integrity: () => import('./IntegrityReportPanel'),
    'bein-spend': () => import('./BeinSpendReportPanel'),
    'points-analysis': () => import('./PointsAnalysisReportPanel'),
    'login-monitor': () => import('./LoginMonitorPanel'),
    'balance-monitor': () => import('./BalanceMonitorPanel'),
    logs: () => import('./LogsReportPanel'),
}

export function getReportPanelLoader(
    tabKey: ReportCenterTabKey,
    loaders: ReportPanelLoaderMap = REPORT_PANEL_LOADERS
): ReportPanelLoader {
    return loaders[tabKey] ?? loaders.analytics
}
