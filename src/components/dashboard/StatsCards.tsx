'use client'

import { StatCard } from '@/components/ui/StatCard'
import { Wallet, Activity, Clock, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'
import { useCountUp } from '@/hooks/useCountUp'
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

// Shimmer loading skeleton component
function ShimmerCard() {
    return (
        <div className="relative overflow-hidden rounded-[var(--border-radius-lg)] bg-[rgba(255,255,255,0.03)] backdrop-blur-md border border-[rgba(255,255,255,0.08)] p-6">
            <div className="flex items-center justify-between">
                <div className="flex-1 space-y-3">
                    {/* Title shimmer */}
                    <div className="h-4 w-24 rounded shimmer bg-[rgba(255,255,255,0.05)]" />
                    {/* Value shimmer */}
                    <div className="h-9 w-32 rounded shimmer bg-[rgba(255,255,255,0.05)]" />
                    {/* Description shimmer */}
                    <div className="h-3 w-16 rounded shimmer bg-[rgba(255,255,255,0.05)]" />
                </div>
                {/* Icon shimmer */}
                <div className="h-12 w-12 rounded-full shimmer bg-[rgba(255,255,255,0.05)]" />
            </div>
        </div>
    )
}

// Animated balance display with gradient text
function AnimatedBalance({ value }: { value: number }) {
    const animatedValue = useCountUp(value, { duration: 1200, decimals: 2, easing: 'easeOut' })
    
    return (
        <span className="font-bold text-[36px] gradient-text">
            {animatedValue}
        </span>
    )
}

// Animated number display
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
    const animatedValue = useCountUp(value, { duration: 800, decimals, easing: 'easeOut' })
    return <>{animatedValue}</>
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

    // Loading state with shimmer skeletons
    if (loading) {
        return (
            <div className="grid gap-[var(--space-lg)] md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.1 }}
                    >
                        <ShimmerCard />
                    </motion.div>
                ))}
            </div>
        )
    }

    const cards = [
        {
            title: t.dashboard.myBalance,
            value: stats?.balance || 0,
            icon: Wallet,
            desc: t.header.currency,
            isHero: true,
            trend: undefined,
            useAnimatedBalance: true
        },
        {
            title: t.dashboard.todayOperations,
            value: stats?.todayOperations || 0,
            icon: Activity,
            desc: t.dashboard.operations || 'Operations',
            isHero: false,
            trend: undefined,
            useAnimatedBalance: false
        },
        {
            title: t.dashboard.lastOperation,
            value: stats?.lastOperation
                ? formatDistanceToNow(new Date(stats.lastOperation.createdAt), { locale: getDateLocale() })
                : '-',
            icon: Clock,
            desc: t.dashboard.ago || 'Ago',
            isHero: false,
            trend: undefined,
            useAnimatedBalance: false
        },
        {
            title: t.dashboard.successRate,
            value: stats?.successRate ?? 0,
            icon: TrendingUp,
            desc: t.dashboard.success || 'Success',
            isHero: false,
            trend: 'up' as const,
            useAnimatedBalance: false
        }
    ]

    return (
        <div className="grid gap-[var(--space-lg)] md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, i) => (
                <motion.div
                    key={i}
                    className="group"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.5,
                        delay: i * 0.08,
                        ease: [0.25, 0.46, 0.45, 0.94]
                    }}
                >
                    <StatCard
                        title={card.title}
                        value={
                            card.useAnimatedBalance && typeof card.value === 'number' ? (
                                <AnimatedBalance value={card.value} />
                            ) : card.isHero === false && typeof card.value === 'number' && card.title === t.dashboard.successRate ? (
                                <><AnimatedNumber value={card.value} />%</>
                            ) : card.isHero === false && typeof card.value === 'number' && card.title === t.dashboard.todayOperations ? (
                                <AnimatedNumber value={card.value} />
                            ) : (
                                card.value
                            )
                        }
                        icon={card.icon}
                        description={card.desc}
                        trend={card.trend}
                        isHero={card.isHero}
                    />
                </motion.div>
            ))}
        </div>
    )
}
