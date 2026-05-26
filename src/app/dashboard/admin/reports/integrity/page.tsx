import { requireAdmin } from '@/lib/auth-utils'
import IntegrityReportPanel from '@/components/admin/report-center/IntegrityReportPanel'

export default async function IntegrityReportsPage() {
    await requireAdmin()

    return <IntegrityReportPanel />
}
