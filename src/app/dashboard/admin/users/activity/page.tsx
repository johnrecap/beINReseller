import { requireAdmin } from '@/lib/auth-utils'
import ActivityReportPanel from '@/components/admin/report-center/ActivityReportPanel'

export default async function UserActivityPage() {
    await requireAdmin()

    return <ActivityReportPanel />
}
