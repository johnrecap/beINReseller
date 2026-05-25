import { requireAdmin } from '@/lib/auth-utils'
import AdminEidRewardsClient from '@/components/admin/eid-rewards/AdminEidRewardsClient'

export default async function AdminEidRewardsPage() {
    await requireAdmin()

    return <AdminEidRewardsClient />
}
