import { requireManager } from "@/lib/auth-utils"
import { ManagerStats } from "@/components/manager/ManagerStats"
import { ManagerUsersList } from "@/components/manager/ManagerUsersList"
import { ManagerActionsLog } from "@/components/manager/ManagerActionsLog"
import { CreateUserDialog } from "@/components/manager/CreateUserDialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { headers } from "next/headers"

// Helper to fetch data server-side
async function getManagerDashboardData() {
    const headersList = await headers()
    const host = headersList.get("host") || "localhost"
    const protocol = host.includes("localhost") ? "http" : "https"

    try {
        const res = await fetch(`${protocol}://${host}/api/manager/dashboard`, {
            headers: {
                // Forward the cookie for authentication
                Cookie: headersList.get("cookie") || ""
            },
            cache: "no-store"
        })

        if (!res.ok) {
            throw new Error("Failed to fetch dashboard data")
        }

        return res.json()
    } catch (error) {
        console.error("Error fetching manager data:", error)
        return null
    }
}

export default async function ManagerDashboardPage() {
    // 1. Verify Manager Role
    await requireManager()

    // 2. Fetch Data
    const data = await getManagerDashboardData()

    if (!data) {
        return <div className="p-8 text-center text-red-500">فشل في تحميل البيانات</div>
    }

    const { stats, recentUsers, recentActions } = data

    return (
        <div className="flex-1 space-y-8 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">لوحة تحكم المدير</h2>
                <div className="flex items-center space-x-2">
                    <CreateUserDialog />
                </div>
            </div>

            {/* Stats Cards */}
            <ManagerStats stats={stats} />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

                {/* Managed Users List */}
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>المستخدمين التابعين لك</CardTitle>
                        <CardDescription>
                            قائمة بآخر المستخدمين الذين قمت بإضافتهم
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ManagerUsersList users={recentUsers} />
                    </CardContent>
                </Card>

                {/* Recent Actions Log */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>سجل النشاطات</CardTitle>
                        <CardDescription>
                            آخر العمليات التي تمت من قبلك أو من قبل مستخدميك
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ManagerActionsLog actions={recentActions} />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
