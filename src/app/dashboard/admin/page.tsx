import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import AdminDashboardClient from '@/components/admin/AdminDashboardClient'

export const metadata = {
    title: 'Admin Dashboard | Desh Panel',
    description: 'System statistics and management',
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
