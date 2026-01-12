import { requireAuth } from '@/lib/auth-utils'
import DashboardShell from '@/components/layout/DashboardShell'
import Providers from '@/components/providers/Providers'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Ensure user is authenticated
    await requireAuth()

    return (
        <Providers>
            <DashboardShell>
                {children}
            </DashboardShell>
        </Providers>
    )
}
