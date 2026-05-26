import { ReportPlaceholderPanel } from './ReportPlaceholderPanel'
import { getReportCenterTab } from './report-tabs'

export default function IntegrityReportPanel() {
    return <ReportPlaceholderPanel tab={getReportCenterTab('integrity')} />
}
