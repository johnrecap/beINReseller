import { ReportPlaceholderPanel } from './ReportPlaceholderPanel'
import { getReportCenterTab } from './report-tabs'

export default function LogsReportPanel() {
    return <ReportPlaceholderPanel tab={getReportCenterTab('logs')} />
}
