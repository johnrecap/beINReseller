import { requireAuth } from '@/lib/auth-utils'
import DashboardShell from '@/components/layout/DashboardShell'


export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Ensure user is authenticated
    await requireAuth()

    return (
        <DashboardShell>
            {children}
        </DashboardShell>
    )
}
