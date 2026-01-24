import { requirePermission, PERMISSIONS } from '@/lib/auth-utils'

export default async function OperationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side permission check - redirects to /dashboard if unauthorized
    // Operations require subscription.renew permission
    await requirePermission(PERMISSIONS.OPERATIONS_VIEW)
    
    return <>{children}</>
}
