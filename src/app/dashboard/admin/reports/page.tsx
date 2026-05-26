import { requireAdmin } from '@/lib/auth-utils'
import AdminReportCenterClient from '@/components/admin/report-center/AdminReportCenterClient'

type AdminReportsPageProps = {
    searchParams?: Promise<{
        tab?: string | string[]
    }>
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
    await requireAdmin()

    const params = await searchParams
    const tab = typeof params?.tab === 'string' ? params.tab : undefined

    return <AdminReportCenterClient initialTab={tab} />
}
