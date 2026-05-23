import { requireAdmin } from '@/lib/auth-utils'
import RecoveryHealthClient from '@/components/admin/RecoveryHealthClient'

export default async function RecoveryHealthPage() {
    await requireAdmin()
    return <RecoveryHealthClient />
}
