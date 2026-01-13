'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Wallet, Activity, Clock, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'
import { motion } from 'framer-motion'

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

// Animated number counter
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
    const [displayValue, setDisplayValue] = useState(0)
    const prevValue = useRef(0)

    useEffect(() => {
        const startValue = prevValue.current
        const endValue = value
        const duration = 1000 // 1 second
        const startTime = Date.now()

        const animate = () => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(elapsed / duration, 1)

            // Easing function
            const eased = 1 - Math.pow(1 - progress, 3)

            const current = startValue + (endValue - startValue) * eased
            setDisplayValue(current)

            if (progress < 1) {
                requestAnimationFrame(animate)
            } else {
                prevValue.current = endValue
            }
        }

        animate()
    }, [value])

    return <>{decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue)}</>
}

export default function StatsCards() {
    const { t, language } = useTranslation()
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)

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
        const interval = setInterval(fetchStats, 30000)
        return () => clearInterval(interval)
    }, [])

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <Card className="bg-card border-border shadow-lg">
                            <CardHeader className="pb-2">
                                <div className="h-4 bg-muted rounded w-20 animate-pulse" />
                            </CardHeader>
                            <CardContent>
                                <div className="h-8 bg-muted rounded w-24 mb-2 animate-pulse" />
                                <div className="h-3 bg-muted rounded w-16 animate-pulse" />
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        )
    }

    const cards = [
        {
            title: t.dashboard.myBalance,
            value: stats?.balance || 0,
            displayValue: stats?.balance?.toFixed(2) || '0.00',
            subtitle: t.header.currency,
            icon: Wallet,
            gradient: 'from-purple-500 to-purple-600',
            shadowColor: 'shadow-purple-500/30',
            isNumber: true,
            decimals: 2
        },
        {
            title: t.dashboard.todayOperations,
            value: stats?.todayOperations || 0,
            displayValue: stats?.todayOperations?.toString() || '0',
            subtitle: t.common.operations || 'Operations',
            icon: Activity,
            gradient: 'from-emerald-500 to-emerald-600',
            shadowColor: 'shadow-emerald-500/30',
            isNumber: true,
            decimals: 0
        },
        {
            title: t.dashboard.lastOperation,
            value: 0,
            displayValue: stats?.lastOperation
                ? formatDistanceToNow(new Date(stats.lastOperation.createdAt), { addSuffix: true, locale: getDateLocale() })
                : '-',
            subtitle: stats?.lastOperation ? `${stats.lastOperation.type}` : t.common.noData,
            icon: Clock,
            gradient: 'from-amber-500 to-amber-600',
            shadowColor: 'shadow-amber-500/30',
            isNumber: false,
            decimals: 0
        },
        {
            title: t.dashboard.successRate,
            value: stats?.successRate ?? 0,
            displayValue: `${stats?.successRate ?? 0}%`,
            subtitle: t.common.status,
            icon: TrendingUp,
            gradient: 'from-blue-500 to-blue-600',
            shadowColor: 'shadow-blue-500/30',
            isNumber: true,
            decimals: 0
        }
    ]

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, i) => {
                const Icon = card.icon
                return (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.4 }}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    >
                        <Card className="bg-card border-border shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    {card.title}
                                </CardTitle>
                                <motion.div
                                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.gradient} ${card.shadowColor} flex items-center justify-center shadow-lg`}
                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                    transition={{ type: "spring", stiffness: 400 }}
                                >
                                    <Icon className="h-5 w-5 text-white" />
                                </motion.div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-foreground">
                                    {card.isNumber ? (
                                        <>
                                            <AnimatedNumber value={card.value} decimals={card.decimals} />
                                            {card.title === t.dashboard.successRate && '%'}
                                        </>
                                    ) : (
                                        card.displayValue
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">{card.subtitle}</p>
                            </CardContent>

                            {/* Hover glow effect */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                        </Card>
                    </motion.div>
                )
            })}
        </div>
    )
}
