'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet, Activity, Clock, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Stats {
    balance: number
    todayOperations: number
    lastOperation: {
        type: string
        createdAt: string
    } | null
    successRate: number
}

export default function StatsCards() {
    const { t, language } = useTranslation()
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/user/stats')
                setStats(await res.json())
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    if (loading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
                ))}
            </div>
        )
    }

    const cards = [
        {
            title: t.dashboard.myBalance,
            value: stats?.balance?.toFixed(2) || '0.00',
            icon: Wallet,
            desc: t.header.currency
        },
        {
            title: t.dashboard.todayOperations,
            value: stats?.todayOperations || 0,
            icon: Activity,
            desc: 'Operations'
        },
        {
            title: t.dashboard.lastOperation,
            value: stats?.lastOperation ? formatDistanceToNow(new Date(stats.lastOperation.createdAt), { locale: getDateLocale() }) : '-',
            icon: Clock,
            desc: 'Ago'
        },
        {
            title: t.dashboard.successRate,
            value: `${stats?.successRate ?? 0}%`,
            icon: TrendingUp,
            desc: 'Success'
        }
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, i) => {
                const Icon = card.icon
                return (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {card.title}
                            </CardTitle>
                            <Icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{card.value}</div>
                            <p className="text-xs text-muted-foreground">
                                {card.desc}
                            </p>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
