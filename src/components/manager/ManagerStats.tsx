import { Users, Activity, CreditCard } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ManagerStatsProps {
    stats: {
        usersCount: number
        actionsCount: number
        totalBalance: number
    }
}

export function ManagerStats({ stats }: ManagerStatsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">المستخدمين</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.usersCount}</div>
                    <p className="text-xs text-muted-foreground">
                        إجمالي المستخدمين المرتبطين بك
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">العمليات</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.actionsCount}</div>
                    <p className="text-xs text-muted-foreground">
                        إجمالي العمليات المسجلة
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">إجمالي الأرصدة</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${stats.totalBalance.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">
                        مجموع أرصدة المستخدمين التابعين
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
