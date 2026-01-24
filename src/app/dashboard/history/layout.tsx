import { requirePermission, PERMISSIONS } from '@/lib/auth-utils'

export default async function HistoryLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side permission check - redirects to /dashboard if unauthorized
    await requirePermission(PERMISSIONS.OPERATIONS_VIEW)
    
    return <>{children}</>
}
