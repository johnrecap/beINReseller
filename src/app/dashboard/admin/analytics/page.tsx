'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
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
    topResellers: {
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
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState(30)

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
        <div className="p-6 space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white">
                        <BarChart3 className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">التحليلات</h1>
                        <p className="text-gray-500">إحصائيات مفصلة عن العمليات</p>
                    </div>
                </div>

                {/* Period Selector */}
                <select
                    value={period}
                    onChange={(e) => setPeriod(Number(e.target.value))}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    aria-label="اختر الفترة الزمنية"
                >
                    <option value={7}>آخر 7 أيام</option>
                    <option value={30}>آخر 30 يوم</option>
                    <option value={90}>آخر 90 يوم</option>
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard
                    icon={<Activity className="w-6 h-6" />}
                    label="إجمالي العمليات"
                    value={(data.summary.totalOperations ?? 0).toLocaleString('ar-SA')}
                    color="blue"
                />
                <SummaryCard
                    icon={<DollarSign className="w-6 h-6" />}
                    label="إجمالي الإيرادات"
                    value={`${data.summary.totalRevenue.toFixed(2)} ر.س`}
                    color="green"
                />
                <SummaryCard
                    icon={<Target className="w-6 h-6" />}
                    label="نسبة النجاح"
                    value={`${data.summary.successRate}%`}
                    color="purple"
                />
                <SummaryCard
                    icon={<TrendingUp className="w-6 h-6" />}
                    label="متوسط العمليات/يوم"
                    value={(data.summary.avgOperationsPerDay ?? 0).toLocaleString('ar-SA')}
                    color="amber"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Operations Trend */}
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        العمليات اليومية
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
                                name="العمليات"
                                strokeWidth={2}
                            />
                            <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke="#10B981"
                                name="الإيرادات"
                                strokeWidth={2}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Operations by Type */}
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-purple-500" />
                        العمليات حسب النوع
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
                        توزيع العمليات بالساعة
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.charts.hourly}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" fontSize={10} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#8B5CF6" name="العمليات" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Operations by Status */}
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-green-500" />
                        العمليات حسب الحالة
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.charts.byStatus} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" fontSize={12} />
                            <YAxis dataKey="label" type="category" fontSize={12} width={100} />
                            <Tooltip />
                            <Bar dataKey="count" name="العدد" radius={[0, 4, 4, 0]}>
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
                    أفضل 10 موزعين
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">#</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">الموزع</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">عدد العمليات</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">إجمالي الإيرادات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.topResellers.map((reseller, index) => (
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
                                    <td className="py-3 px-4 text-muted-foreground">{(reseller.operationsCount ?? 0).toLocaleString('ar-SA')}</td>
                                    <td className="py-3 px-4 text-green-600 font-medium">{reseller.totalRevenue.toFixed(2)} ر.س</td>
                                </tr>
                            ))}
                            {data.topResellers.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                                        لا توجد بيانات
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
