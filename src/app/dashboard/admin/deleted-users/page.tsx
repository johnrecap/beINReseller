import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Trash2 } from 'lucide-react'
import DeletedUsersTable from '@/components/admin/users/DeletedUsersTable'

export const metadata = {
    title: 'الحسابات المحذوفة | beIN Panel',
    description: 'عرض الحسابات المحذوفة وبياناتها',
}

export default async function DeletedUsersPage() {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                    <Trash2 className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">الحسابات المحذوفة</h1>
                    <p className="text-muted-foreground text-sm">عرض الحسابات المحذوفة مع الرصيد والمعاملات</p>
                </div>
            </div>

            <Suspense fallback={<div>جاري التحميل...</div>}>
                <DeletedUsersTable />
            </Suspense>
        </div>
    )
}
