import { requireAuth } from '@/lib/auth-utils'
import DashboardContent from '@/components/dashboard/DashboardContent'

export default async function DashboardPage() {
    const user = await requireAuth()

    return <DashboardContent user={user} />
}
