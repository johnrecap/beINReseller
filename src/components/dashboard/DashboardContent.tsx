'use client'

import { useTranslation } from '@/hooks/useTranslation'
import DashboardBalanceCard from '@/components/dashboard/DashboardBalanceCard'
import QuickActionTile from '@/components/dashboard/QuickActionTile'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import RequestCreditEntry from '@/components/credit-requests/RequestCreditEntry'
import EidRewardPopup from '@/components/eid-rewards/EidRewardPopup'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { canAccessSignal, canAccessSubscription } from '@/lib/permissions'
import { Role } from '@/lib/permissions'

interface DashboardContentProps {
    user: { role: string; balance: number }
}

export default function DashboardContent({ user }: DashboardContentProps) {
    const { t } = useTranslation()
    const canRenew = canAccessSubscription(user.role as Role)
    const canSignal = canAccessSignal(user.role as Role)
    const showQuickActions = canRenew || canSignal || user.role === 'USER'

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
        >
            <EidRewardPopup />

            {/* Announcement Banner */}
            <AnnouncementBanner />

            <div className="grid gap-[var(--space-lg)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
                <DashboardBalanceCard balance={user.balance} />

                {showQuickActions && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                    >
                        <Card variant="primary">
                            <CardHeader>
                                <CardTitle className="text-[18px] font-semibold text-[var(--color-text-primary)]">
                                    {t.dashboard.quickActions}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-3 md:grid-cols-2">
                                {canRenew && (
                                    <QuickActionTile
                                        href="/dashboard/renew"
                                        icon={Zap}
                                        iconColor="#00A651"
                                        iconBgColor="rgba(0, 166, 81, 0.15)"
                                        title={t.dashboard.renewSubscription}
                                        description={t.dashboard.renewDesc}
                                    />
                                )}
                                {canSignal && (
                                    <QuickActionTile
                                        href="/dashboard/renew"
                                        icon={RefreshCw}
                                        iconColor="#3B82F6"
                                        iconBgColor="rgba(59, 130, 246, 0.15)"
                                        title={t.dashboard.refreshSignal}
                                        description={t.dashboard.refreshSignalDesc}
                                    />
                                )}
                                <RequestCreditEntry userRole={user.role} />
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </div>
        </motion.div>
    )
}
