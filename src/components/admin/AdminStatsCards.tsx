import { Users, CreditCard, Activity, TrendingUp } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface Stats {
    totalUsers: number
    totalBalance: number
    todayOperations: number
    successRate: number
}

export default function AdminStatsCards({ stats }: { stats?: Stats }) {
    const { t } = useTranslation()

    // Safe stats object with defaults
    const safeStats = {
        totalUsers: stats?.totalUsers ?? 0,
        totalBalance: stats?.totalBalance ?? 0,
        todayOperations: stats?.todayOperations ?? 0,
        successRate: stats?.successRate ?? 0
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Users */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-full">
                        {t.admin.dashboard.stats.active}
                    </span>
                </div>
                <h3 className="text-gray-500 text-sm font-medium mb-1">{t.admin.dashboard.stats.totalUsers}</h3>
                <p className="text-2xl font-bold text-gray-800">{safeStats.totalUsers}</p>
            </div>

            {/* Total Balance */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-purple-50 rounded-lg">
                        <CreditCard className="w-6 h-6 text-purple-600" />
                    </div>
                </div>
                <h3 className="text-gray-500 text-sm font-medium mb-1">{t.admin.dashboard.stats.totalBalance}</h3>
                <p className="text-2xl font-bold text-gray-800">{safeStats.totalBalance.toLocaleString()} {t.header.currency}</p>
            </div>

            {/* Today's Operations */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-amber-50 rounded-lg">
                        <Activity className="w-6 h-6 text-amber-600" />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                        {t.admin.dashboard.stats.today}
                    </span>
                </div>
                <h3 className="text-gray-500 text-sm font-medium mb-1">{t.admin.dashboard.stats.todayOperations}</h3>
                <p className="text-2xl font-bold text-gray-800">{safeStats.todayOperations}</p>
            </div>

            {/* Success Rate */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-green-50 rounded-lg">
                        <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                    <span className="text-xs text-gray-400">{t.admin.dashboard.stats.last7Days}</span>
                </div>
                <h3 className="text-gray-500 text-sm font-medium mb-1">{t.admin.dashboard.stats.successRate}</h3>
                <p className="text-2xl font-bold text-gray-800 dir-ltr text-right">{safeStats.successRate}%</p>
            </div>
        </div>
    )
}
