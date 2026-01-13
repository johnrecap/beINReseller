'use client'

import { useTranslation } from '@/hooks/useTranslation'
import StatsCards from '@/components/dashboard/StatsCards'
import RecentOperations from '@/components/dashboard/RecentOperations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Zap, Search, RefreshCw } from 'lucide-react'

interface DashboardContentProps {
    user: { username: string; role: string }
}

export default function DashboardContent({ user }: DashboardContentProps) {
    const { t } = useTranslation()

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight">{t.dashboard.welcome}, {user.username}</h2>
                <p className="text-muted-foreground">
                    {user.role === 'ADMIN' ? t.dashboard.adminWelcome : t.dashboard.resellerWelcome}
                </p>
            </div>

            {/* Stats */}
            <StatsCards />

            {/* Main Content Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

                {/* Recent Operations (Takes up 4 columns) */}
                <div className="col-span-4">
                    <RecentOperations />
                </div>

                {/* Quick Actions (Takes up 3 columns) */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>{t.dashboard.quickActions}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <QuickAction
                            href="/dashboard/operations"
                            icon={Zap}
                            title={t.dashboard.renewSubscription}
                            desc={t.dashboard.renewDesc}
                        />
                        <QuickAction
                            href="/dashboard/operations"
                            icon={Search}
                            title={t.dashboard.checkBalance}
                            desc={t.dashboard.checkBalanceDesc}
                        />
                        <QuickAction
                            href="/dashboard/operations"
                            icon={RefreshCw}
                            title={t.dashboard.refreshSignal}
                            desc={t.dashboard.refreshSignalDesc}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

interface QuickActionProps {
    href: string
    icon: React.ComponentType<{ className?: string }>
    title: string
    desc: string
}

function QuickAction({ href, icon: Icon, title, desc }: QuickActionProps) {
    return (
        <Link
            href={href}
            className="flex items-start gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
        >
            <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <h3 className="font-medium text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-1">{desc}</p>
            </div>
        </Link>
    )
}
