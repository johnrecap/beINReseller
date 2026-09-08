import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import TransactionsTable from '@/components/transactions/TransactionsTable'
import TransactionsHeading from '@/components/transactions/TransactionsHeading'

export const metadata = {
    title: 'Transactions | Desh Panel',
    description: 'Financial transactions, deposits and withdrawals history',
}

export default async function TransactionsPage() {
    await requireAuth()

    return (
        <div className="space-y-6">
            <TransactionsHeading />

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
