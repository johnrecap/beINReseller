import { requireAdmin } from '@/lib/auth-utils'
import LoginMonitorPanel from '@/components/admin/report-center/LoginMonitorPanel'

export default async function BeinLoginFailuresPage() {
    await requireAdmin()

    return <LoginMonitorPanel />
}
