import { requireAdmin } from '@/lib/auth-utils'
import BeinSpendReportPanel from '@/components/admin/report-center/BeinSpendReportPanel'

export default async function BeinSpendReportPage() {
    await requireAdmin()

    return <BeinSpendReportPanel />
}
