'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    PROCESSING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    COMPLETED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
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

    const statusLabels: Record<string, string> = {
        PENDING: t.status.pending,
        PROCESSING: t.status.processing,
        COMPLETED: t.status.completed,
        FAILED: t.status.failed,
        AWAITING_CAPTCHA: t.status.awaitingCaptcha,
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
            <Card className="bg-card border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t.dashboard.recentOperations}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-muted"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-muted rounded w-32 mb-2"></div>
                                    <div className="h-3 bg-muted rounded w-24"></div>
                                </div>
                                <div className="h-6 bg-muted rounded w-16"></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="bg-card border-0 shadow-lg">
            <CardHeader>
                <CardTitle className="text-lg text-foreground">{t.dashboard.recentOperations}</CardTitle>
            </CardHeader>
            <CardContent>
                {operations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>{t.common.noData}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {operations.map((op) => (
                            <div key={op.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary transition-colors">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${op.type === 'RENEW' ? 'bg-purple-100 dark:bg-purple-900/30' :
                                    op.type === 'CHECK' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
                                    }`}>
                                    <span className="text-lg">
                                        {op.type === 'RENEW' ? '⚡' : op.type === 'CHECK' ? '🔍' : '📡'}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground">
                                        {typeLabels[op.type] || op.type}
                                    </p>
                                    <p className="text-sm text-muted-foreground truncate">
                                        {op.cardNumber} • {formatDistanceToNow(new Date(op.createdAt), { addSuffix: true, locale: getDateLocale() })}
                                    </p>
                                </div>
                                <Badge className={`${statusColors[op.status]} border-0`}>
                                    {statusLabels[op.status] || op.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
