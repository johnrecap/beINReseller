'use client'

import { useTranslation } from '@/hooks/useTranslation'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import StatsCards from '@/components/dashboard/StatsCards'
import RecentOperations from '@/components/dashboard/RecentOperations'
import QuickActionTile from '@/components/dashboard/QuickActionTile'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'

interface DashboardContentProps {
    user: { username: string; role: string }
}

export default function DashboardContent({ user }: DashboardContentProps) {
    const { t } = useTranslation()

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
        >
            {/* Header Section */}
            <DashboardHeader
                username={user.username}
                role={user.role as 'ADMIN' | 'RESELLER'}
            />

            {/* Stats Cards Row */}
            <StatsCards />

            {/* Main Content Grid - RTL: Quick Actions 40% RIGHT / Activity 60% LEFT */}
            <div className="grid gap-[var(--space-lg)] lg:grid-cols-5">

                {/* Recent Operations - Left column in RTL (3/5 = 60%) */}
                <motion.div
                    className="lg:col-span-3 order-2 lg:order-1"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                >
                    <RecentOperations />
                </motion.div>

                {/* Quick Actions - Right column in RTL (2/5 = 40%) */}
                <motion.div
                    className="lg:col-span-2 order-1 lg:order-2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                >
                    <Card variant="primary">
                        <CardHeader>
                            <CardTitle className="text-[18px] font-semibold text-[var(--color-text-primary)]">
                                {t.dashboard.quickActions}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <QuickActionTile
                                href="/dashboard/renew"
                                icon={Zap}
                                iconColor="#00A651"
                                iconBgColor="rgba(0, 166, 81, 0.15)"
                                title={t.dashboard.renewSubscription}
                                description={t.dashboard.renewDesc}
                            />
                            <QuickActionTile
                                href="/dashboard/renew"
                                icon={RefreshCw}
                                iconColor="#3B82F6"
                                iconBgColor="rgba(59, 130, 246, 0.15)"
                                title={t.dashboard.refreshSignal}
                                description={t.dashboard.refreshSignalDesc}
                            />
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </motion.div>
    )
}
