'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActivityItem } from '@/components/ui/ActivityItem'
import { Activity, Clock, Wallet } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage: string | null
    createdAt: string
}

export default function RecentOperations() {
    const { t, language } = useTranslation()
    const [operations, setOperations] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const typeLabels: Record<string, string> = {
        RENEW: t.operations.renew,
        CHECK: t.operations.checkBalance,
        SIGNAL_REFRESH: t.operations.refreshSignal
    }

    useEffect(() => {
        const fetchOperations = async () => {
            try {
                const res = await fetch('/api/user/recent-operations')
                const data = await res.json()
                setOperations(data.operations || [])
            } catch (error) {
                console.error('Failed to fetch operations:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchOperations()
        const interval = setInterval(fetchOperations, 10000)
        return () => clearInterval(interval)
    }, [])

    if (loading) {
        return (
            <Card className="bg-[var(--color-bg-card)] border-0 shadow-[var(--shadow-card)]">
                <CardHeader>
                    <CardTitle className="text-lg text-[var(--color-text-primary)]">{t.dashboard.recentOperations}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-[var(--color-bg-elevated)]"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-[var(--color-bg-elevated)] rounded w-32 mb-2"></div>
                                    <div className="h-3 bg-[var(--color-bg-elevated)] rounded w-24"></div>
                                </div>
                                <div className="h-6 bg-[var(--color-bg-elevated)] rounded w-16"></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card variant="primary">
            <CardHeader>
                <CardTitle className="text-[18px] font-semibold text-[var(--color-text-primary)]">
                    آخر العمليات
                </CardTitle>
            </CardHeader>
            <CardContent>
                {operations.length === 0 ? (
                    <div className="text-center py-8 text-[var(--color-text-muted)]">
                        <p>{t.common.noData}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {operations.map((op) => (
                            <ActivityItem
                                key={op.id}
                                title={typeLabels[op.type] || op.type}
                                subtitle={op.cardNumber}
                                timestamp={formatDistanceToNow(new Date(op.createdAt), { addSuffix: true, locale: getDateLocale() })}
                                status={op.status === 'COMPLETED' ? 'success' : op.status === 'FAILED' ? 'failed' : 'pending'}
                                icon={op.type === 'RENEW' ? Activity : op.type === 'CHECK' ? Wallet : Clock}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
