'use client'

import { useState, useEffect } from 'react'
import { LayoutDashboard } from 'lucide-react'
import AdminStatsCards from '@/components/admin/AdminStatsCards'
import OperationsChart from '@/components/admin/OperationsChart'
import RecentFailures from '@/components/admin/RecentFailures'
import RecentDeposits from '@/components/admin/RecentDeposits'
import WorkerStatusCard from '@/components/admin/WorkerStatusCard'
import { useTranslation } from '@/hooks/useTranslation'

export default function AdminDashboardClient() {
    const { t } = useTranslation()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/admin/dashboard')
                if (!res.ok) {
                    const json = await res.json()
                    throw new Error(json.error || 'SERVER_ERROR')
                }
                const jsonData = await res.json()
                setData(jsonData)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }

        fetchStats()
    }, [])

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-12 w-48 bg-gray-200 rounded-lg"></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
                    ))}
                </div>
                <div className="h-64 bg-gray-200 rounded-xl"></div>
            </div>
        )
    }

    if (error) {
        // Better error handling:
        const displayError = (error === 'UNAUTHORIZED' || error === 'غير مصرح') ? 'Unauthorized' :
            (error === 'SERVER_ERROR' || error === 'حدث خطأ في الخادم') ? t.admin.dashboard.workerStatus.error : error

        return (
            <div className="p-8 text-center">
                <div className="bg-red-50 text-red-600 p-4 rounded-xl inline-block">
                    ❌ {displayError}
                </div>
            </div>
        )
    }

    if (!data) return null

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shadow-lg">
                    <LayoutDashboard className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">{t.admin.dashboard.title}</h1>
                    <p className="text-gray-500 text-sm">{t.admin.dashboard.subtitle}</p>
                </div>
            </div>

            {/* Stats Cards */}
            <AdminStatsCards stats={data.stats} />

            {/* Worker Status */}
            <WorkerStatusCard />

            {/* Chart */}
            <OperationsChart data={data.chartData} />

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RecentFailures data={data.recentFailures} />
                <RecentDeposits data={data.recentDeposits} />
            </div>
        </div>
    )
}
