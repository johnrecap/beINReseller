'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActivityItem } from '@/components/ui/ActivityItem'
import { Activity, Clock, Wallet } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage: string | null
    createdAt: string
}

// Shimmer loading skeleton
function ShimmerRow() {
    return (
        <div className="flex items-center gap-4">
            {/* Icon shimmer */}
            <div className="w-10 h-10 rounded-full shimmer bg-[rgba(255,255,255,0.05)]" />
            {/* Content shimmer */}
            <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded shimmer bg-[rgba(255,255,255,0.05)]" />
                <div className="h-3 w-24 rounded shimmer bg-[rgba(255,255,255,0.05)]" />
            </div>
            {/* Status shimmer */}
            <div className="h-6 w-16 rounded-full shimmer bg-[rgba(255,255,255,0.05)]" />
        </div>
    )
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
            <Card 
                className={cn(
                    "bg-[rgba(255,255,255,0.03)]",
                    "backdrop-blur-md",
                    "border border-[rgba(255,255,255,0.08)]",
                    "shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
                )}
            >
                <CardHeader>
                    <CardTitle className="text-lg text-[var(--color-text-primary)]">
                        {t.dashboard.recentOperations}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                            >
                                <ShimmerRow />
                            </motion.div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card 
            variant="primary"
            className={cn(
                // Glassmorphism
                "bg-[rgba(255,255,255,0.03)]",
                "backdrop-blur-md",
                "border border-[rgba(255,255,255,0.08)]",
                // Hover effect
                "transition-all duration-300",
                "hover:bg-[rgba(255,255,255,0.05)]",
                "hover:border-[rgba(255,255,255,0.12)]",
                "hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
            )}
        >
            <CardHeader>
                <CardTitle className="text-[18px] font-semibold text-[var(--color-text-primary)]">
                    {t.dashboard.recentOperations}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {operations.length === 0 ? (
                    <motion.div 
                        className="text-center py-8 text-[var(--color-text-muted)]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                    >
                        <p>{t.common.noData}</p>
                    </motion.div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {operations.map((op, index) => (
                                <motion.div
                                    key={op.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ 
                                        duration: 0.3, 
                                        delay: index * 0.05,
                                        ease: 'easeOut'
                                    }}
                                    className={cn(
                                        "rounded-lg p-1",
                                        "transition-all duration-200",
                                        "hover:bg-[rgba(255,255,255,0.03)]"
                                    )}
                                >
                                    <ActivityItem
                                        title={typeLabels[op.type] || op.type}
                                        subtitle={op.cardNumber}
                                        timestamp={formatDistanceToNow(new Date(op.createdAt), { addSuffix: true, locale: getDateLocale() })}
                                        status={op.status === 'COMPLETED' ? 'success' : op.status === 'FAILED' ? 'failed' : 'pending'}
                                        icon={op.type === 'RENEW' ? Activity : op.type === 'CHECK' ? Wallet : Clock}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
