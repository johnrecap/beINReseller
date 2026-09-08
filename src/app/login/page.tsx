import { auth } from '@/lib/auth'
import { getDbAuthenticatedUser } from '@/lib/auth-utils'
import { redirect } from 'next/navigation'
import LoginPageClient from '@/components/auth/LoginPageClient'

export default async function LoginPage() {
    let valid = false
    let revoked = false
    try {
        const session = await auth()
        if (session?.user?.id) {
            valid = !!await getDbAuthenticatedUser(session.user.id, session.user.passwordChangedAt || 0)
            revoked = !valid
        }
    } catch {
        return <LoginPageClient unavailable />
    }
    if (valid) redirect('/dashboard')
    return <LoginPageClient revoked={revoked} />
}
