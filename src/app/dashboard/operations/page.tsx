import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import OperationTabs from '@/components/operations/OperationTabs'
import { Zap } from 'lucide-react'

export const metadata = {
    title: 'العمليات | beIN Panel',
    description: 'تجديد الاشتراكات واستعلام الرصيد وتنشيط الإشارة',
}

export default async function OperationsPage() {
    // Check authentication
    await requireAuth()

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">العمليات</h1>
                    <p className="text-gray-500 text-sm">تجديد الاشتراكات واستعلام الرصيد وتنشيط الإشارة</p>
                </div>
            </div>

            {/* Operations Tabs */}
            <Suspense fallback={
                <div className="bg-white rounded-2xl shadow-lg p-8 animate-pulse">
                    <div className="h-12 bg-gray-200 rounded-lg mb-6"></div>
                    <div className="space-y-4">
                        <div className="h-10 bg-gray-200 rounded-lg"></div>
                        <div className="h-10 bg-gray-200 rounded-lg"></div>
                        <div className="h-12 bg-gray-200 rounded-lg"></div>
                    </div>
                </div>
            }>
                <OperationTabs />
            </Suspense>

            {/* Quick Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                    <h3 className="font-bold text-purple-800 mb-1">⚡ تجديد الاشتراك</h3>
                    <p className="text-sm text-purple-600">جدد اشتراك أي بطاقة beIN بسهولة</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                    <h3 className="font-bold text-blue-800 mb-1">🔍 استعلام الرصيد</h3>
                    <p className="text-sm text-blue-600">تحقق من رصيد أي بطاقة</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                    <h3 className="font-bold text-green-800 mb-1">📡 تنشيط الإشارة</h3>
                    <p className="text-sm text-green-600">أعد تنشيط الإشارة للبطاقة</p>
                </div>
            </div>
        </div>
    )
}
