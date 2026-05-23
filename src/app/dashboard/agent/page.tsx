import { requireAgent } from '@/lib/auth-utils'
import AgentDashboardClient from '@/components/agent/AgentDashboardClient'

export default async function AgentDashboardPage() {
    await requireAgent()

    return <AgentDashboardClient />
}
