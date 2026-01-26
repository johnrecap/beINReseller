'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'
import {
    BarChart3,
    TrendingUp,
    PieChart,
    Users,
    Clock,
    DollarSign,
    Activity,
    Target
} from 'lucide-react'
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart as RechartsPie,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts'

interface AnalyticsData {
    period: { days: number; startDate: string }
    summary: {
        totalOperations: number
        totalRevenue: number
        successRate: number
        avgOperationsPerDay: number
    }
    charts: {
        daily: { date: string; operations: number; revenue: number }[]
        byType: { type: string; label: string; count: number; revenue: number }[]
        byStatus: { status: string; label: string; count: number }[]
        hourly: { hour: number; label: string; count: number }[]
    }
    topUsers: {
        id: string
        username: string
        operationsCount: number
        totalRevenue: number
    }[]
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
const STATUS_COLORS: Record<string, string> = {
    COMPLETED: '#10B981',
    PENDING: '#F59E0B',
    PROCESSING: '#3B82F6',
    FAILED: '#EF4444',
    CANCELLED: '#6B7280',
}

export default function AnalyticsPage() {
    const { data: session, status } = useSession()
    const { t, dir } = useTranslation()
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState(30)

    // Set dynamic page title
    useEffect(() => {
        document.title = `${t.analytics?.title || 'Analytics'} | Desh Panel`
    }, [t])

    useEffect(() => {
        if (status === 'unauthenticated') {
            redirect('/login')
        }
        if (session?.user?.role !== 'ADMIN') {
            redirect('/dashboard')
        }
    }, [session, status])

    const fetchAnalytics = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/analytics?days=${period}`)
            if (res.ok) {
                const result = await res.json()
                setData(result)
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error)
        } finally {
            setLoading(false)
        }
    }, [period])

    useEffect(() => {
        fetchAnalytics()
    }, [period, fetchAnalytics])

    if (loading || !data) {
        return (
            <div className="p-6 animate-pulse space-y-6">
                <div className="h-8 bg-muted rounded w-48" />
                <div className="grid grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-32 bg-muted rounded-xl" />
                    ))}
                </div>
                <div className="h-80 bg-muted rounded-xl" />
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6" dir={dir}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white">
                        <BarChart3 className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.analytics?.title || 'Analytics'}</h1>
                        <p className="text-muted-foreground">{t.analytics?.subtitle || 'Detailed operations statistics'}</p>
                    </div>
                </div>

                {/* Period Selector */}
                <select
                    value={period}
                    onChange={(e) => setPeriod(Number(e.target.value))}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    aria-label={t.analytics?.periodSelector || 'Select period'}
                >
                    <option value={7}>{t.analytics?.last7Days || 'Last 7 days'}</option>
                    <option value={30}>{t.analytics?.last30Days || 'Last 30 days'}</option>
                    <option value={90}>{t.analytics?.last90Days || 'Last 90 days'}</option>
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard
                    icon={<Activity className="w-6 h-6" />}
                    label={t.analytics?.summary?.totalOperations || 'Total Operations'}
                    value={(data.summary.totalOperations ?? 0).toLocaleString()}
                    color="blue"
                />
                <SummaryCard
                    icon={<DollarSign className="w-6 h-6" />}
                    label={t.analytics?.summary?.totalRevenue || 'Total Revenue'}
                    value={`${data.summary.totalRevenue.toFixed(2)} ${t.header?.currency || 'USD'}`}
                    color="green"
                />
                <SummaryCard
                    icon={<Target className="w-6 h-6" />}
                    label={t.analytics?.summary?.successRate || 'Success Rate'}
                    value={`${data.summary.successRate}%`}
                    color="purple"
                />
                <SummaryCard
                    icon={<TrendingUp className="w-6 h-6" />}
                    label={t.analytics?.summary?.avgPerDay || 'Avg Operations/Day'}
                    value={(data.summary.avgOperationsPerDay ?? 0).toLocaleString()}
                    color="amber"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Operations Trend */}
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        {t.analytics?.charts?.dailyOperations || 'Daily Operations'}
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data.charts.daily}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="operations"
                                stroke="#3B82F6"
                                name={t.analytics?.charts?.operations || 'Operations'}
                                strokeWidth={2}
                            />
                            <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke="#10B981"
                                name={t.analytics?.charts?.revenue || 'Revenue'}
                                strokeWidth={2}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Operations by Type */}
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-purple-500" />
                        {t.analytics?.charts?.byType || 'Operations by Type'}
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <RechartsPie>
                            <Pie
                                data={data.charts.byType}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="count"
                                nameKey="label"
                                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                                {data.charts.byType.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </RechartsPie>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Hourly Distribution */}
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-500" />
                        {t.analytics?.charts?.hourlyDistribution || 'Hourly Distribution'}
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.charts.hourly}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" fontSize={10} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#8B5CF6" name={t.analytics?.charts?.operations || 'Operations'} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Operations by Status */}
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-green-500" />
                        {t.analytics?.charts?.byStatus || 'Operations by Status'}
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.charts.byStatus} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" fontSize={12} />
                            <YAxis dataKey="label" type="category" fontSize={12} width={100} />
                            <Tooltip />
                            <Bar dataKey="count" name={t.analytics?.charts?.count || 'Count'} radius={[0, 4, 4, 0]}>
                                {data.charts.byStatus.map((entry) => (
                                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#6B7280'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Resellers Table */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    {t.analytics?.topResellers?.title || 'Top 10 Resellers'}
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className={`${dir === 'rtl' ? 'text-right' : 'text-left'} py-3 px-4 font-medium text-muted-foreground`}>{t.analytics?.topResellers?.rank || '#'}</th>
                                <th className={`${dir === 'rtl' ? 'text-right' : 'text-left'} py-3 px-4 font-medium text-muted-foreground`}>{t.analytics?.topResellers?.reseller || 'Reseller'}</th>
                                <th className={`${dir === 'rtl' ? 'text-right' : 'text-left'} py-3 px-4 font-medium text-muted-foreground`}>{t.analytics?.topResellers?.operationsCount || 'Operations Count'}</th>
                                <th className={`${dir === 'rtl' ? 'text-right' : 'text-left'} py-3 px-4 font-medium text-muted-foreground`}>{t.analytics?.topResellers?.totalRevenue || 'Total Revenue'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.topUsers.map((reseller, index) => (
                                <tr key={reseller.id} className="border-b border-border/50 hover:bg-secondary">
                                    <td className="py-3 px-4">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${index === 0 ? 'bg-yellow-500' :
                                            index === 1 ? 'bg-gray-400' :
                                                index === 2 ? 'bg-amber-700' : 'bg-gray-300'
                                            }`}>
                                            {index + 1}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 font-medium text-foreground">{reseller.username}</td>
                                    <td className="py-3 px-4 text-muted-foreground">{(reseller.operationsCount ?? 0).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-green-600 font-medium">{reseller.totalRevenue.toFixed(2)} {t.header?.currency || 'USD'}</td>
                                </tr>
                            ))}
                            {data.topUsers.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                                        {t.analytics?.topResellers?.noData || 'No data available'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function SummaryCard({ icon, label, value, color }: {
    icon: React.ReactNode
    label: string
    value: string
    color: 'blue' | 'green' | 'purple' | 'amber'
}) {
    const colorClasses = {
        blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
        green: 'bg-green-50 dark:bg-green-900/30 text-green-600',
        purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
        amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
    }

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
                    {icon}
                </div>
                <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                </div>
            </div>
        </div>
    )
}
