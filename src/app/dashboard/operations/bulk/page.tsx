import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import BulkRenewForm from '@/components/operations/BulkRenewForm'
import { Layers } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
    title: 'عمليات الجملة | beIN Panel',
    description: 'تجديد اشتراكات متعددة دفعة واحدة',
}

export default async function BulkOperationsPage() {
    await requireAuth()

    return (
        <div className="space-y-6" dir="rtl">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Link href="/dashboard/operations" className="hover:text-purple-600">
                    العمليات
                </Link>
                <span>/</span>
                <span className="text-gray-800">عمليات الجملة</span>
            </div>

            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
                    <Layers className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">عمليات الجملة</h1>
                    <p className="text-gray-500 text-sm">تجديد اشتراكات متعددة دفعة واحدة (حتى 10 كروت)</p>
                </div>
            </div>

            {/* Form */}
            <Suspense fallback={
                <div className="bg-white rounded-2xl shadow-lg p-8 animate-pulse">
                    <div className="h-32 bg-gray-200 rounded-lg mb-6"></div>
                    <div className="h-12 bg-gray-200 rounded-lg"></div>
                </div>
            }>
                <BulkRenewForm />
            </Suspense>

            {/* Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                <h3 className="font-bold mb-2">💡 تعليمات:</h3>
                <ul className="list-disc list-inside space-y-1">
                    <li>أدخل رقم كارت واحد في كل سطر</li>
                    <li>الحد الأقصى 10 كروت في الطلب الواحد</li>
                    <li>سيتم تطبيق نفس المدة على جميع الكروت</li>
                    <li>الكروت التي لديها عمليات جارية سيتم تخطيها</li>
                </ul>
            </div>
        </div>
    )
}
