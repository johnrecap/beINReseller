'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet, Activity, Clock, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Stats {
    balance: number
    todayOperations: number
    lastOperation: {
        type: string
        cardNumber: string
        status: string
        createdAt: string
    } | null
    successRate: number
}

export default function StatsCards() {
    const { t, language } = useTranslation()
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)

    // Map language to date-fns locale
    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/user/stats')
                const data = await res.json()
                setStats(data)
            } catch (error) {
                console.error('Failed to fetch stats:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchStats()
        // Refresh every 30 seconds
        const interval = setInterval(fetchStats, 30000)
        return () => clearInterval(interval)
    }, [])

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="bg-white border-0 shadow-lg animate-pulse">
                        <CardHeader className="pb-2">
                            <div className="h-4 bg-gray-200 rounded w-20"></div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-8 bg-gray-200 rounded w-24 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-16"></div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }


    const cards = [
        {
            title: t.dashboard.myBalance,
            value: stats?.balance?.toFixed(2) || '0.00',
            subtitle: t.header.currency,
            icon: Wallet,
            gradient: 'from-purple-500 to-purple-600'
        },
        {
            title: t.dashboard.todayOperations,
            value: stats?.todayOperations || 0,
            subtitle: t.common.operations || 'Operations',
            icon: Activity,
            gradient: 'from-emerald-500 to-emerald-600'
        },
        {
            title: t.dashboard.lastOperation,
            value: stats?.lastOperation
                ? formatDistanceToNow(new Date(stats.lastOperation.createdAt), { addSuffix: true, locale: getDateLocale() })
                : '-',
            subtitle: stats?.lastOperation ? `${stats.lastOperation.type}` : t.common.noData,
            icon: Clock,
            gradient: 'from-amber-500 to-amber-600'
        },
        {
            title: t.dashboard.successRate,
            value: `${stats?.successRate || 100}%`,
            subtitle: t.common.status,
            icon: TrendingUp,
            gradient: 'from-blue-500 to-blue-600'
        }
    ]

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, i) => {
                const Icon = card.icon
                return (
                    <Card key={i} className="bg-white border-0 shadow-lg hover:shadow-xl transition-all">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">{card.title}</CardTitle>
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center`}>
                                <Icon className="h-5 w-5 text-white" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-gray-800">{card.value}</div>
                            <p className="text-sm text-gray-400">{card.subtitle}</p>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
