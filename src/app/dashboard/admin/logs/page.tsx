import { requireAdmin } from '@/lib/auth-utils'
import LogsReportPanel from '@/components/admin/report-center/LogsReportPanel'

export const metadata = {
    title: 'Activity Logs | Desh Panel',
    description: 'Monitor user and system activity',
}

export default async function AdminLogsPage() {
    await requireAdmin()

    return <LogsReportPanel />
}
