import { requireAuth } from '@/lib/auth-utils'
import RequestCreditForm from '@/components/credit-requests/RequestCreditForm'

export default async function CreditRequestsPage() {
    await requireAuth()

    return <RequestCreditForm />
}
