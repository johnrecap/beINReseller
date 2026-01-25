import { requireManager } from "@/lib/auth-utils"
import { ManagerStats } from "@/components/manager/ManagerStats"
import { ManagerUsersList } from "@/components/manager/ManagerUsersList"
import { ManagerActionsLog } from "@/components/manager/ManagerActionsLog"
import { CreateUserDialog } from "@/components/manager/CreateUserDialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { headers } from "next/headers"
import { ManagerPageContent } from "@/components/manager/ManagerPageContent"

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

    return <ManagerPageContent data={data} />
}
