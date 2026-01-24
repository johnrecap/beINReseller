'use client'

import { useTranslation } from '@/hooks/useTranslation'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import StatsCards from '@/components/dashboard/StatsCards'
import RecentOperations from '@/components/dashboard/RecentOperations'
import QuickActionTile from '@/components/dashboard/QuickActionTile'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { canAccessSubscription } from '@/lib/permissions'
import { Role } from '@/lib/permissions'

interface DashboardContentProps {
    user: { username: string; role: string }
}

export default function DashboardContent({ user }: DashboardContentProps) {
    const { t } = useTranslation()
    
    // Check if user can access subscription/signal features
    const showQuickActions = canAccessSubscription(user.role as Role)

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
                role={user.role as 'ADMIN' | 'MANAGER' | 'USER'}
            />

            {/* Stats Cards Row */}
            <StatsCards />

            {/* Main Content Grid 
                Layout Strategy:
                - Desktop (lg): 5 columns.
                - Quick Actions (2 cols).
                - Activity (3 cols).
                - DOM Order: Quick Actions FIRST, Activity SECOND.
                - RTL: Grid starts from Right. Item 1 (Quick Actions) will be on Right. Item 2 (Activity) on Left.
                - LTR: Item 1 (Quick Actions) on Left. Item 2 (Activity) on Right. (Unless we want force RTL layout everywhere?)
                Assuming the requirement "Right Column: Quick Actions" is specific to the Arabic/RTL context of the panel.
            */}
            <div className="grid gap-[var(--space-lg)] lg:grid-cols-5">

                {/* Quick Actions (40%) - Only show for users with subscription permission */}
                {showQuickActions && (
                <motion.div
                    className="lg:col-span-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
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
                )}

                {/* Recent Operations - Takes full width if Quick Actions hidden */}
                <motion.div
                    className={showQuickActions ? "lg:col-span-3" : "lg:col-span-5"}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                >
                    <RecentOperations />
                </motion.div>
            </div>
        </motion.div>
    )
}
