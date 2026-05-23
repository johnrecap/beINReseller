import { requireAdmin } from '@/lib/auth-utils'
import AdminAgentsClient from '@/components/admin/agents/AdminAgentsClient'

export default async function AdminAgentsPage() {
    await requireAdmin()

    return <AdminAgentsClient />
}
