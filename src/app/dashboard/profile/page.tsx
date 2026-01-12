import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import ProfilePageClient from '@/components/profile/ProfilePageClient'

export const metadata = {
    title: 'الملف الشخصي | beIN Panel',
    description: 'إدارة الملف الشخصي',
}

export default async function ProfilePage() {
    await requireAuth()

    return (
        <Suspense fallback={<div>جاري التحميل...</div>}>
            <ProfilePageClient />
        </Suspense>
    )
}
