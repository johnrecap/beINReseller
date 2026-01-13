'use client'

import { useTranslation } from '@/hooks/useTranslation'
import StatsCards from '@/components/dashboard/StatsCards'
import RecentOperations from '@/components/dashboard/RecentOperations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/effects'

interface DashboardContentProps {
    user: any
}

export default function DashboardContent({ user }: DashboardContentProps) {
    const { t } = useTranslation()

    return (
        <div className="space-y-6">
            {/* Welcome Banner */}
            <motion.div
                className="bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl shadow-purple-500/20"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {/* Animated background elements */}
                <div className="absolute inset-0 overflow-hidden">
                    <motion.div
                        className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"
                        animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.1, 0.2, 0.1]
                        }}
                        transition={{ duration: 4, repeat: Infinity }}
                    />
                    <motion.div
                        className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-300/20 rounded-full blur-2xl"
                        animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.1, 0.15, 0.1]
                        }}
                        transition={{ duration: 5, repeat: Infinity, delay: 1 }}
                    />
                </div>

                <div className="relative z-10">
                    <motion.h1
                        className="text-2xl font-bold mb-1"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        {t.dashboard.welcome}، {user.username} 👋
                    </motion.h1>
                    <motion.p
                        className="text-purple-100"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        {user.role === 'ADMIN' ? t.dashboard.adminWelcome : t.dashboard.resellerWelcome}
                    </motion.p>
                </div>
            </motion.div>

            {/* Stats Cards - Client Component */}
            <FadeIn delay={0.2}>
                <StatsCards />
            </FadeIn>

            {/* Two Column Layout */}
            <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 gap-6" staggerDelay={0.15}>
                {/* Recent Operations */}
                <StaggerItem>
                    <RecentOperations />
                </StaggerItem>

                {/* Quick Actions */}
                <StaggerItem>
                    <Card className="bg-card border-border shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <CardHeader>
                            <CardTitle className="text-lg text-foreground">{t.dashboard.quickActions}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <QuickActionLink
                                href="/dashboard/operations"
                                icon="⚡"
                                title={t.dashboard.renewSubscription}
                                description={t.dashboard.renewDesc}
                                color="purple"
                                delay={0}
                            />
                            <QuickActionLink
                                href="/dashboard/operations"
                                icon="🔍"
                                title={t.dashboard.checkBalance}
                                description={t.dashboard.checkBalanceDesc}
                                color="emerald"
                                delay={0.1}
                            />
                            <QuickActionLink
                                href="/dashboard/operations"
                                icon="📡"
                                title={t.dashboard.refreshSignal}
                                description={t.dashboard.refreshSignalDesc}
                                color="amber"
                                delay={0.2}
                            />
                        </CardContent>
                    </Card>
                </StaggerItem>
            </StaggerContainer>
        </div>
    )
}

interface QuickActionLinkProps {
    href: string
    icon: string
    title: string
    description: string
    color: 'purple' | 'emerald' | 'amber'
    delay: number
}

function QuickActionLink({ href, icon, title, description, color, delay }: QuickActionLinkProps) {
    const colorClasses = {
        purple: {
            bg: 'from-purple-50 to-purple-100 dark:from-purple-500/10 dark:to-purple-500/20',
            hover: 'hover:from-purple-100 hover:to-purple-200 dark:hover:from-purple-500/20 dark:hover:to-purple-500/30',
            icon: 'bg-purple-500 shadow-purple-500/30',
        },
        emerald: {
            bg: 'from-emerald-50 to-emerald-100 dark:from-emerald-500/10 dark:to-emerald-500/20',
            hover: 'hover:from-emerald-100 hover:to-emerald-200 dark:hover:from-emerald-500/20 dark:hover:to-emerald-500/30',
            icon: 'bg-emerald-500 shadow-emerald-500/30',
        },
        amber: {
            bg: 'from-amber-50 to-amber-100 dark:from-amber-500/10 dark:to-amber-500/20',
            hover: 'hover:from-amber-100 hover:to-amber-200 dark:hover:from-amber-500/20 dark:hover:to-amber-500/30',
            icon: 'bg-amber-500 shadow-amber-500/30',
        },
    }

    return (
        <motion.a
            href={href}
            className={`flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r ${colorClasses[color].bg} ${colorClasses[color].hover} transition-all group`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay }}
            whileHover={{ scale: 1.01, x: 4 }}
            whileTap={{ scale: 0.99 }}
        >
            <motion.div
                className={`w-12 h-12 rounded-xl ${colorClasses[color].icon} flex items-center justify-center shadow-lg`}
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 400 }}
            >
                <span className="text-2xl">{icon}</span>
            </motion.div>
            <div>
                <p className="font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
        </motion.a>
    )
}
