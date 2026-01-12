import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import AdminDashboardClient from '@/components/admin/AdminDashboardClient'

export const metadata = {
    title: 'لوحة الإدارة | beIN Panel',
    description: 'إحصائيات وإدارة النظام',
}

export default async function AdminDashboardPage() {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <Suspense fallback={<div>جاري التحميل...</div>}>
            <AdminDashboardClient />
        </Suspense>
    )
}
