import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import ProfilePageClient from '@/components/profile/ProfilePageClient'

export const metadata = {
    title: 'Profile | Desh Panel',
    description: 'Manage your profile',
}

export default async function ProfilePage() {
    await requireAuth()

    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ProfilePageClient />
        </Suspense>
    )
}
