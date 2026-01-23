import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import UsersTable from '@/components/admin/users/UsersTable'
import { Users } from 'lucide-react'

export const metadata = {
    title: 'إدارة الموزعين | beIN Panel',
    description: 'إدارة حسابات الموزعين والصلاحيات',
}

export default async function AdminUsersPage() {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إدارة الموزعين</h1>
                    <p className="text-muted-foreground text-sm">عرض وإدارة جميع حسابات الموزعين في النظام</p>
                </div>
            </div>

            <Suspense fallback={<div>جاري التحميل...</div>}>
                <UsersTable />
            </Suspense>
        </div>
    )
}
