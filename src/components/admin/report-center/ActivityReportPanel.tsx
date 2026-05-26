import { ReportPlaceholderPanel } from './ReportPlaceholderPanel'
import { getReportCenterTab } from './report-tabs'

export default function ActivityReportPanel() {
    return <ReportPlaceholderPanel tab={getReportCenterTab('activity')} />
}
