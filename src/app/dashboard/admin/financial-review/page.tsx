import { requireAdmin } from '@/lib/auth-utils'
import FinancialReviewClient from '@/components/admin/financial-review/FinancialReviewClient'

export default async function FinancialReviewPage() {
    await requireAdmin()
    return <FinancialReviewClient />
}
