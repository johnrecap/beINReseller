'use client'

import { StatCard } from '@/components/ui/StatCard'
import { Wallet, Activity, Clock, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'
import { motion } from 'framer-motion'

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
            <div className="grid gap-[var(--space-lg)] md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <div
                        key={i}
                        className="h-32 rounded-[var(--border-radius-lg)] bg-[var(--color-bg-elevated)] animate-pulse"
                    />
                ))}
            </div>
        )
    }

    const cards = [
        {
            title: t.dashboard.myBalance,
            value: stats?.balance?.toFixed(2) || '0.00',
            icon: Wallet,
            desc: t.header.currency,
            isHero: true,  // Hero card flag
            trend: undefined
        },
        {
            title: t.dashboard.todayOperations,
            value: stats?.todayOperations || 0,
            icon: Activity,
            desc: 'Operations',
            isHero: false,
            trend: undefined
        },
        {
            title: t.dashboard.lastOperation,
            value: stats?.lastOperation
                ? formatDistanceToNow(new Date(stats.lastOperation.createdAt), { locale: getDateLocale() })
                : '-',
            icon: Clock,
            desc: 'Ago',
            isHero: false,
            trend: undefined
        },
        {
            title: t.dashboard.successRate,
            value: `${stats?.successRate ?? 0}%`,
            icon: TrendingUp,
            desc: 'Success',
            isHero: false,
            trend: 'up' as const
        }
    ]

    return (
        <div className="grid gap-[var(--space-lg)] md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.5,
                        delay: i * 0.05,
                        ease: 'easeOut'
                    }}
                >
                    <StatCard
                        title={card.title}
                        value={card.value}
                        icon={card.icon}
                        description={card.desc}
                        trend={card.trend}
                        className={
                            card.isHero
                                ? `
                                    relative overflow-hidden
                                    border-l-2 border-l-[var(--color-primary-green)]
                                    before:absolute before:inset-0 
                                    before:bg-gradient-to-br before:from-[rgba(0,166,81,0.1)] before:to-transparent
                                    before:pointer-events-none
                                `
                                : ''
                        }
                        valueClassName={card.isHero ? 'text-[36px] text-[var(--color-primary-green)]' : ''}
                    />
                </motion.div>
            ))}
        </div>
    )
}
