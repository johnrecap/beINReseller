import { ReportPlaceholderPanel } from './ReportPlaceholderPanel'
import { getReportCenterTab } from './report-tabs'

export default function BalanceMonitorPanel() {
    return <ReportPlaceholderPanel tab={getReportCenterTab('balance-monitor')} />
}
