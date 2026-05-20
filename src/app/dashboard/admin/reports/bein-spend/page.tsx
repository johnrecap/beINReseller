import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import BeinSpendReportClient from '@/components/admin/reports/BeinSpendReportClient'

export default async function BeinSpendReportPage() {
    const session = await auth()

    if (!session?.user) redirect('/login')
    if (session.user.role !== 'ADMIN') redirect('/dashboard')

    return <BeinSpendReportClient />
}
