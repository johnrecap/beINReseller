import { getManagerDashboardData } from "@/lib/manager-dashboard"
import { requireManager } from "@/lib/auth-utils"
import { ManagerPageContent } from "@/components/manager/ManagerPageContent"

export default async function ManagerDashboardPage() {
    const user = await requireManager()

    const data = await getManagerDashboardData(user).catch(() => null)

    return <ManagerPageContent data={data} />
}
