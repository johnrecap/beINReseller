import { requireAuth } from '@/lib/auth-utils'
import RewardsClient from '@/components/rewards/RewardsClient'

export default async function RewardsPage() {
    await requireAuth()

    return <RewardsClient />
}
