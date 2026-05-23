import { requireAdmin } from '@/lib/auth-utils'
import AdminPointsSettingsClient from '@/components/admin/points/AdminPointsSettingsClient'

export default async function AdminPointsPage() {
    await requireAdmin()

    return <AdminPointsSettingsClient />
}
