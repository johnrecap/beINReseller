'use client'

import { Users, UserCheck, AlertTriangle, UserX, Clock } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { ACTIVITY_STATUS, STATUS_CHART_COLORS } from '@/lib/activity-status'
import type { InactivityMetrics } from '@/lib/services/activityTracker'

interface ActivityOverviewCardsProps {
    metrics: InactivityMetrics
    loading?: boolean
}

export function ActivityOverviewCards({ metrics, loading }: ActivityOverviewCardsProps) {
    const { t, locale } = useTranslation()
    const dir = locale === 'ar' ? 'rtl' : 'ltr'
    
    const cards = [
        {
            label: locale === 'ar' ? 'إجمالي المستخدمين' : 'Total Users',
            value: metrics.total,
            icon: Users,
            color: 'from-slate-500 to-slate-600',
            textColor: 'text-slate-600 dark:text-slate-400'
        },
        {
            label: ACTIVITY_STATUS.active.label[locale as 'ar' | 'en'],
            value: metrics.active,
            icon: UserCheck,
            color: 'from-green-500 to-green-600',
            textColor: 'text-green-600 dark:text-green-400',
            percentage: metrics.total > 0 ? Math.round((metrics.active / metrics.total) * 100) : 0,
            description: locale === 'ar' ? '< 3 أيام' : '< 3 days'
        },
        {
            label: ACTIVITY_STATUS.warning.label[locale as 'ar' | 'en'],
            value: metrics.warning,
            icon: AlertTriangle,
            color: 'from-yellow-500 to-yellow-600',
            textColor: 'text-yellow-600 dark:text-yellow-400',
            percentage: metrics.total > 0 ? Math.round((metrics.warning / metrics.total) * 100) : 0,
            description: locale === 'ar' ? '7-14 يوم' : '7-14 days'
        },
        {
            label: ACTIVITY_STATUS.inactive.label[locale as 'ar' | 'en'],
            value: metrics.inactive,
            icon: Clock,
            color: 'from-orange-500 to-orange-600',
            textColor: 'text-orange-600 dark:text-orange-400',
            percentage: metrics.total > 0 ? Math.round((metrics.inactive / metrics.total) * 100) : 0,
            description: locale === 'ar' ? '14-30 يوم' : '14-30 days'
        },
        {
            label: ACTIVITY_STATUS.critical.label[locale as 'ar' | 'en'],
            value: metrics.critical,
            icon: UserX,
            color: 'from-red-500 to-red-600',
            textColor: 'text-red-600 dark:text-red-400',
            percentage: metrics.total > 0 ? Math.round((metrics.critical / metrics.total) * 100) : 0,
            description: locale === 'ar' ? '> 30 يوم' : '> 30 days'
        }
    ]
    
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" dir={dir}>
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-card rounded-xl border border-border p-6 animate-pulse">
                        <div className="h-4 bg-muted rounded w-20 mb-2" />
                        <div className="h-8 bg-muted rounded w-12" />
                    </div>
                ))}
            </div>
        )
    }
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" dir={dir}>
            {cards.map((card, index) => {
                const Icon = card.icon
                return (
                    <div 
                        key={index} 
                        className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-xl bg-gradient-to-br ${card.color} text-white shadow-sm`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-muted-foreground truncate">{card.label}</p>
                                <div className="flex items-baseline gap-2">
                                    <p className={`text-2xl font-bold ${card.textColor}`}>
                                        {card.value.toLocaleString()}
                                    </p>
                                    {card.percentage !== undefined && (
                                        <span className="text-xs text-muted-foreground">
                                            ({card.percentage}%)
                                        </span>
                                    )}
                                </div>
                                {card.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

interface InactivityBreakdownProps {
    metrics: InactivityMetrics
    loading?: boolean
}

export function InactivityBreakdown({ metrics, loading }: InactivityBreakdownProps) {
    const { locale } = useTranslation()
    const dir = locale === 'ar' ? 'rtl' : 'ltr'
    
    const categories = [
        { key: 'active', ...ACTIVITY_STATUS.active, count: metrics.active },
        { key: 'recent', ...ACTIVITY_STATUS.recent, count: metrics.recent },
        { key: 'warning', ...ACTIVITY_STATUS.warning, count: metrics.warning },
        { key: 'inactive', ...ACTIVITY_STATUS.inactive, count: metrics.inactive },
        { key: 'critical', ...ACTIVITY_STATUS.critical, count: metrics.critical }
    ]
    
    if (loading) {
        return (
            <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
                <div className="h-6 bg-muted rounded w-40 mb-4" />
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-10 bg-muted rounded" />
                    ))}
                </div>
            </div>
        )
    }
    
    return (
        <div className="bg-card rounded-xl border border-border p-6" dir={dir}>
            <h3 className="text-lg font-semibold text-foreground mb-4">
                {locale === 'ar' ? 'توزيع النشاط' : 'Activity Distribution'}
            </h3>
            
            <div className="space-y-3">
                {categories.map((cat) => {
                    const percentage = metrics.total > 0 
                        ? Math.round((cat.count / metrics.total) * 100) 
                        : 0
                    
                    return (
                        <div key={cat.key} className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${cat.dotClass}`} />
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-medium text-foreground">
                                        {cat.label[locale as 'ar' | 'en']}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {cat.count} ({percentage}%)
                                    </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full ${cat.dotClass} transition-all duration-500`}
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-center">
                                {cat.days}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default ActivityOverviewCards
