import { ReportPlaceholderPanel } from './ReportPlaceholderPanel'
import { getReportCenterTab } from './report-tabs'

export default function LoginMonitorPanel() {
    return <ReportPlaceholderPanel tab={getReportCenterTab('login-monitor')} />
}
