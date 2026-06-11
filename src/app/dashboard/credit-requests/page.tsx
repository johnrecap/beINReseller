import { requireAuth } from '@/lib/auth-utils'
import { getCreditRequestAccess } from '@/lib/credit-requests/access'
import { redirect } from 'next/navigation'
import RequestCreditForm from '@/components/credit-requests/RequestCreditForm'

export default async function CreditRequestsPage() {
    const user = await requireAuth()
    const access = await getCreditRequestAccess(user.id)

    if (!access.canRequest) {
        redirect('/dashboard')
    }

    return <RequestCreditForm />
}
