import { requireAdmin } from '@/lib/auth-utils'
import AdminCreditRequestsClient from '@/components/admin/credit-requests/AdminCreditRequestsClient'

export default async function AdminCreditRequestsPage() {
    await requireAdmin()

    return <AdminCreditRequestsClient />
}
