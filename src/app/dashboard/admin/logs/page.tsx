import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import LogsTable from '@/components/admin/LogsTable'
import { ShieldAlert } from 'lucide-react'

export const metadata = {
    title: 'سجلات النشاط | beIN Panel',
    description: 'مراقبة نشاط المستخدمين والنظام',
}

export default async function AdminLogsPage() {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg">
                    <ShieldAlert className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">سجلات النشاط</h1>
                    <p className="text-gray-500 text-sm">تتبع جميع العمليات والإجراءات في النظام</p>
                </div>
            </div>

            <Suspense fallback={<div>جاري التحميل...</div>}>
                <LogsTable />
            </Suspense>
        </div>
    )
}
