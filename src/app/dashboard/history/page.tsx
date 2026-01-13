import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth-utils'
import HistoryPageClient from '@/components/history/HistoryPageClient'

export const metadata = {
    title: 'سجل العمليات | beIN Panel',
    description: 'عرض جميع العمليات السابقة',
}

export default async function HistoryPage() {
    await requireAuth()

    return (
        <Suspense fallback={
            <div className="space-y-6" dir="rtl">
                <div className="h-16 bg-muted rounded-xl animate-pulse"></div>
                <div className="h-24 bg-muted rounded-xl animate-pulse"></div>
                <div className="h-96 bg-muted rounded-xl animate-pulse"></div>
            </div>
        }>
            <HistoryPageClient />
        </Suspense>
    )
}
