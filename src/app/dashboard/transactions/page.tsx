import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import TransactionsTable from '@/components/transactions/TransactionsTable'
import { Wallet } from 'lucide-react'

export const metadata = {
    title: 'Transactions | Desh Panel',
    description: 'Financial transactions, deposits and withdrawals history',
}

export default async function TransactionsPage() {
    await requireAuth()

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 rounded-full bg-[#3B82F6] flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                        <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">المعاملات المالية</h1>
                        <p className="text-muted-foreground text-sm font-medium">سجل دفع حركات الرصيد (شراء، سحب، عمليات)</p>
                    </div>
                </div>
            </div>

            {/* Transactions Table */}
            <Suspense fallback={
                <div className="bg-card rounded-xl shadow-sm p-12 flex justify-center">
                    <div className="animate-pulse flex flex-col items-center">
                        <div className="h-12 w-full bg-muted rounded-lg mb-4"></div>
                        <div className="h-64 w-full bg-muted rounded-lg"></div>
                    </div>
                </div>
            }>
                <TransactionsTable />
            </Suspense>
        </div>
    )
}
