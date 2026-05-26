import { requireAdmin } from '@/lib/auth-utils'
import AnalyticsReportPanel from '@/components/admin/report-center/AnalyticsReportPanel'

export default async function AnalyticsPage() {
    await requireAdmin()

    return <AnalyticsReportPanel />
}
