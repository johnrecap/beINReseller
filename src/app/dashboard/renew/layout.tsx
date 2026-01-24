import { requirePermission, PERMISSIONS } from '@/lib/auth-utils'

export default async function RenewLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side permission check - redirects to /dashboard if unauthorized
    await requirePermission(PERMISSIONS.SUBSCRIPTION_RENEW)
    
    return <>{children}</>
}
