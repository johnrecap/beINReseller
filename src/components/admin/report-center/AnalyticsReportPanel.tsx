import { ReportPlaceholderPanel } from './ReportPlaceholderPanel'
import { getReportCenterTab } from './report-tabs'

export default function AnalyticsReportPanel() {
    return <ReportPlaceholderPanel tab={getReportCenterTab('analytics')} />
}
