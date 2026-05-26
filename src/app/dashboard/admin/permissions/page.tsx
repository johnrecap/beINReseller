import { requireAdmin } from '@/lib/auth-utils'
import AdminPermissionsClient from '@/components/admin/permissions/AdminPermissionsClient'

export default async function AdminPermissionsPage() {
    await requireAdmin()

    return <AdminPermissionsClient />
}
