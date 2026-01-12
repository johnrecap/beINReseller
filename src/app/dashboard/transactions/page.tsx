import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import TransactionsTable from '@/components/transactions/TransactionsTable'
import { CreditCard } from 'lucide-react'

export const metadata = {
    title: 'المعاملات المالية | beIN Panel',
    description: 'سجل المعاملات المالية والشحن والسحب',
}

export default async function TransactionsPage() {
    await requireAuth()

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <CreditCard className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">المعاملات المالية</h1>
                    <p className="text-gray-500 text-sm">سجل جميع حركات الرصيد (شحن، سحب، عمليات)</p>
                </div>
            </div>

            {/* Transactions Table */}
            <Suspense fallback={
                <div className="bg-white rounded-xl shadow-sm p-12 flex justify-center">
                    <div className="animate-pulse flex flex-col items-center">
                        <div className="h-12 w-full bg-gray-200 rounded-lg mb-4"></div>
                        <div className="h-64 w-full bg-gray-100 rounded-lg"></div>
                    </div>
                </div>
            }>
                <TransactionsTable />
            </Suspense>
        </div>
    )
}
