import { requireAdmin } from '@/lib/auth-utils'
import BalanceMonitorPanel from '@/components/admin/report-center/BalanceMonitorPanel'

export default async function BeinLowBalancePage() {
    await requireAdmin()

    return <BalanceMonitorPanel />
}
