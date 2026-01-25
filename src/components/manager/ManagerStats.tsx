'use client'

import { Users, Activity, CreditCard, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "@/hooks/useTranslation"

interface ManagerStatsProps {
    stats: {
        usersCount: number
        actionsCount: number
        totalBalance: number
        managerBalance: number
    }
}

export function ManagerStats({ stats }: ManagerStatsProps) {
    const { t } = useTranslation()
    
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Manager's Own Balance */}
            <Card className="border-[#00A651]/30 bg-gradient-to-br from-[#00A651]/10 to-transparent">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.manager?.stats?.currentBalance || 'Your Balance'}</CardTitle>
                    <Wallet className="h-4 w-4 text-[#00A651]" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-[#00A651]">${stats.managerBalance.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">
                        {t.manager?.stats?.availableForTransfer || 'Available balance to transfer to users'}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.manager?.stats?.usersManaged || 'Users'}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.usersCount}</div>
                    <p className="text-xs text-muted-foreground">
                        {t.manager?.stats?.totalUsersLinked || 'Total users linked to you'}
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.manager?.stats?.totalOperations || 'Operations'}</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.actionsCount}</div>
                    <p className="text-xs text-muted-foreground">
                        {t.manager?.stats?.totalActionsRecorded || 'Total actions recorded'}
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.manager?.stats?.totalBalances || 'Total Balances'}</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${stats.totalBalance.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">
                        {t.manager?.stats?.sumOfUserBalances || 'Sum of linked users balances'}
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}

