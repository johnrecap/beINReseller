import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import BulkRenewForm from '@/components/operations/BulkRenewForm'
import { Layers } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
    title: 'Bulk Operations | Desh Panel',
    description: 'Renew multiple subscriptions at once',
}

export default async function BulkOperationsPage() {
    await requireAuth()

    return (
        <div className="space-y-6" dir="rtl">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/dashboard/renew" className="hover:text-[#00A651]">
                    Interactive Renewal
                </Link>
                <span>/</span>
                <span className="text-foreground">Bulk Operations</span>
            </div>

            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
                    <Layers className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Bulk Operations</h1>
                    <p className="text-muted-foreground text-sm">Renew multiple subscriptions at once (up to 10 cards)</p>
                </div>
            </div>

            {/* Form */}
            <Suspense fallback={
                <div className="bg-card rounded-2xl shadow-lg p-8 animate-pulse">
                    <div className="h-32 bg-muted rounded-lg mb-6"></div>
                    <div className="h-12 bg-muted rounded-lg"></div>
                </div>
            }>
                <BulkRenewForm />
            </Suspense>

            {/* Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                <h3 className="font-bold mb-2">💡 Instructions:</h3>
                <ul className="list-disc list-inside space-y-1">
                    <li>Enter one card number per line</li>
                    <li>Maximum 10 cards per request</li>
                    <li>Same duration will be applied to all cards</li>
                    <li>Cards with active operations will be skipped</li>
                </ul>
            </div>
        </div>
    )
}
