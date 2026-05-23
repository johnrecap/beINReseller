import { requireAdmin } from '@/lib/auth-utils'
import AdminRewardsClient from '@/components/admin/rewards/AdminRewardsClient'

export default async function AdminRewardsPage() {
    await requireAdmin()

    return <AdminRewardsClient />
}
