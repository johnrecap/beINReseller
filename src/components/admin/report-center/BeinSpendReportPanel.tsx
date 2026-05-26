import { ReportPlaceholderPanel } from './ReportPlaceholderPanel'
import { getReportCenterTab } from './report-tabs'

export default function BeinSpendReportPanel() {
    return <ReportPlaceholderPanel tab={getReportCenterTab('bein-spend')} />
}
