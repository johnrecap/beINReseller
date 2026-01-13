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
                    <h1 className="text-2xl font-bold text-foreground">العمليات</h1>
                    <p className="text-muted-foreground text-sm">تجديد الاشتراكات واستعلام الرصيد وتنشيط الإشارة</p>
                </div>
            </div>

            {/* Operations Tabs */}
            <Suspense fallback={
                <div className="bg-card rounded-2xl shadow-lg p-8 animate-pulse">
                    <div className="h-12 bg-muted rounded-lg mb-6"></div>
                    <div className="space-y-4">
                        <div className="h-10 bg-muted rounded-lg"></div>
                        <div className="h-10 bg-muted rounded-lg"></div>
                        <div className="h-12 bg-muted rounded-lg"></div>
                    </div>
                </div>
            }>
                <OperationTabs />
            </Suspense>

            {/* Quick Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                    <h3 className="font-bold text-purple-800 dark:text-purple-300 mb-1">⚡ تجديد الاشتراك</h3>
                    <p className="text-sm text-purple-600 dark:text-purple-400">جدد اشتراك أي بطاقة beIN بسهولة</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                    <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-1">🔍 استعلام الرصيد</h3>
                    <p className="text-sm text-blue-600 dark:text-blue-400">تحقق من رصيد أي بطاقة</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                    <h3 className="font-bold text-green-800 dark:text-green-300 mb-1">📡 تنشيط الإشارة</h3>
                    <p className="text-sm text-green-600 dark:text-green-400">أعد تنشيط الإشارة للبطاقة</p>
                </div>
            </div>
        </div>
    )
}
