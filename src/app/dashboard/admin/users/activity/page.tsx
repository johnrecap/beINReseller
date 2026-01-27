'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect, useRouter } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'
import { 
    Activity, 
    TrendingUp, 
    UserX, 
    RefreshCw,
    Download
} from 'lucide-react'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts'
import { ActivityOverviewCards, InactivityBreakdown } from '@/components/admin/ActivityOverviewCards'
import { InactiveUsersTable } from '@/components/admin/InactiveUsersTable'
import type { InactivityMetrics, InactiveUser } from '@/types/activity'

interface ActivityAnalyticsData {
    period: { days: number; startDate: string; endDate: string }
    inactivityMetrics: InactivityMetrics
    charts: {
        loginsByDay: { date: string; count: number }[]
        operationsByDay: { date: string; count: number }[]
    }
    topActiveUsers: Array<{
        id: string
        username: string
        role: string
        loginCount: number
        totalOperations: number
    }>
}

interface InactiveUsersData {
    users: InactiveUser[]
    total: number
    page: number
    limit: number
    totalPages: number
    filters: {
        days: number
        role?: string
        sortBy: string
        sortOrder: string
        search?: string
    }
}

export default function UserActivityPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { locale } = useTranslation()
    const dir = locale === 'ar' ? 'rtl' : 'ltr'
    
    const [analyticsData, setAnalyticsData] = useState<ActivityAnalyticsData | null>(null)
    const [inactiveUsersData, setInactiveUsersData] = useState<InactiveUsersData | null>(null)
    const [analyticsLoading, setAnalyticsLoading] = useState(true)
    const [usersLoading, setUsersLoading] = useState(true)
    const [analyticsPeriod, setAnalyticsPeriod] = useState(30)
    const [activeTab, setActiveTab] = useState<'overview' | 'inactive'>('overview')
    
    // Inactive users filters
    const [filters, setFilters] = useState({
        days: 30,
        role: undefined as string | undefined,
        sortBy: 'lastLogin',
        sortOrder: 'asc',
        search: undefined as string | undefined
    })
    const [page, setPage] = useState(1)
    
    // Auth check
    useEffect(() => {
        if (status === 'loading') return // Wait for session to load
        if (status === 'unauthenticated') {
            redirect('/login')
        }
        if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
            redirect('/dashboard')
        }
    }, [session, status])
    
    // Set page title
    useEffect(() => {
        document.title = `${locale === 'ar' ? 'مراقبة النشاط' : 'Activity Monitoring'} | Desh Panel`
    }, [locale])
    
    // Fetch analytics data
    const fetchAnalytics = useCallback(async () => {
        setAnalyticsLoading(true)
        try {
            const res = await fetch(`/api/admin/analytics/activity?days=${analyticsPeriod}`)
            if (res.ok) {
                const data = await res.json()
                setAnalyticsData(data)
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error)
        } finally {
            setAnalyticsLoading(false)
        }
    }, [analyticsPeriod])
    
    // Fetch inactive users
    const fetchInactiveUsers = useCallback(async () => {
        setUsersLoading(true)
        try {
            const params = new URLSearchParams({
                days: filters.days.toString(),
                page: page.toString(),
                limit: '20',
                sortBy: filters.sortBy,
                sortOrder: filters.sortOrder
            })
            if (filters.role) params.set('role', filters.role)
            if (filters.search) params.set('search', filters.search)
            
            const res = await fetch(`/api/admin/users/inactive?${params}`)
            if (res.ok) {
                const data = await res.json()
                setInactiveUsersData(data)
            }
        } catch (error) {
            console.error('Failed to fetch inactive users:', error)
        } finally {
            setUsersLoading(false)
        }
    }, [filters, page])
    
    useEffect(() => {
        fetchAnalytics()
    }, [fetchAnalytics])
    
    useEffect(() => {
        if (activeTab === 'inactive') {
            fetchInactiveUsers()
        }
    }, [activeTab, fetchInactiveUsers])
    
    const handleFiltersChange = (newFilters: Partial<typeof filters>) => {
        setFilters(prev => ({ ...prev, ...newFilters }))
        setPage(1) // Reset to first page on filter change
    }
    
    const handleViewUser = (userId: string) => {
        router.push(`/dashboard/admin/users?highlight=${userId}`)
    }
    
    // Combine chart data
    const chartData = analyticsData ? 
        analyticsData.charts.loginsByDay.map((login, index) => ({
            date: login.date,
            logins: login.count,
            operations: analyticsData.charts.operationsByDay[index]?.count || 0
        })) : []
    
    if (status === 'loading') {
        return (
            <div className="p-6 animate-pulse space-y-6">
                <div className="h-8 bg-muted rounded w-48" />
                <div className="grid grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-32 bg-muted rounded-xl" />
                    ))}
                </div>
            </div>
        )
    }
    
    return (
        <div className="p-6 space-y-6" dir={dir}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {locale === 'ar' ? 'مراقبة نشاط المستخدمين' : 'User Activity Monitoring'}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {locale === 'ar' 
                                ? 'تتبع النشاط وتحديد الحسابات غير النشطة' 
                                : 'Track activity and identify inactive accounts'
                            }
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Period Selector */}
                    <select
                        value={analyticsPeriod}
                        onChange={(e) => setAnalyticsPeriod(Number(e.target.value))}
                        className="px-4 py-2 border border-border rounded-lg bg-background text-sm focus:ring-2 focus:ring-primary"
                    >
                        <option value={7}>{locale === 'ar' ? 'آخر 7 أيام' : 'Last 7 days'}</option>
                        <option value={30}>{locale === 'ar' ? 'آخر 30 يوم' : 'Last 30 days'}</option>
                        <option value={90}>{locale === 'ar' ? 'آخر 90 يوم' : 'Last 90 days'}</option>
                    </select>
                    
                    {/* Refresh Button */}
                    <button
                        onClick={() => {
                            fetchAnalytics()
                            if (activeTab === 'inactive') fetchInactiveUsers()
                        }}
                        className="p-2 border border-border rounded-lg hover:bg-muted transition-colors"
                        title={locale === 'ar' ? 'تحديث' : 'Refresh'}
                    >
                        <RefreshCw className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'overview'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        {locale === 'ar' ? 'نظرة عامة' : 'Overview'}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('inactive')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'inactive'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <UserX className="w-4 h-4" />
                        {locale === 'ar' ? 'المستخدمون غير النشطين' : 'Inactive Users'}
                        {analyticsData && analyticsData.inactivityMetrics.inactive + analyticsData.inactivityMetrics.critical > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                                {analyticsData.inactivityMetrics.inactive + analyticsData.inactivityMetrics.critical}
                            </span>
                        )}
                    </span>
                </button>
            </div>
            
            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Overview Cards */}
                    <ActivityOverviewCards 
                        metrics={analyticsData?.inactivityMetrics || {
                            total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0,
                            byRole: {
                                ADMIN: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 },
                                MANAGER: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 },
                                USER: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 }
                            }
                        }}
                        loading={analyticsLoading}
                    />
                    
                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Activity Trend Chart */}
                        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6">
                            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-500" />
                                {locale === 'ar' ? 'اتجاه النشاط' : 'Activity Trend'}
                            </h3>
                            {analyticsLoading ? (
                                <div className="h-[300px] bg-muted rounded animate-pulse" />
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis 
                                            dataKey="date" 
                                            fontSize={12} 
                                            tickFormatter={(value) => value.slice(5)}
                                        />
                                        <YAxis fontSize={12} />
                                        <Tooltip />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="logins"
                                            stroke="#3b82f6"
                                            name={locale === 'ar' ? 'تسجيلات الدخول' : 'Logins'}
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="operations"
                                            stroke="#10b981"
                                            name={locale === 'ar' ? 'العمليات' : 'Operations'}
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        
                        {/* Inactivity Breakdown */}
                        <InactivityBreakdown 
                            metrics={analyticsData?.inactivityMetrics || {
                                total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0,
                                byRole: {
                                    ADMIN: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 },
                                    MANAGER: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 },
                                    USER: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 }
                                }
                            }}
                            loading={analyticsLoading}
                        />
                    </div>
                    
                    {/* Top Active Users */}
                    {analyticsData && analyticsData.topActiveUsers.length > 0 && (
                        <div className="bg-card rounded-xl border border-border p-6">
                            <h3 className="text-lg font-semibold text-foreground mb-4">
                                {locale === 'ar' ? 'أكثر المستخدمين نشاطاً' : 'Most Active Users'}
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className="text-start py-3 px-4 text-sm font-medium text-muted-foreground">#</th>
                                            <th className="text-start py-3 px-4 text-sm font-medium text-muted-foreground">
                                                {locale === 'ar' ? 'المستخدم' : 'User'}
                                            </th>
                                            <th className="text-start py-3 px-4 text-sm font-medium text-muted-foreground">
                                                {locale === 'ar' ? 'الدور' : 'Role'}
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                                                {locale === 'ar' ? 'تسجيلات الدخول' : 'Logins'}
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                                                {locale === 'ar' ? 'العمليات' : 'Operations'}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {analyticsData.topActiveUsers.map((user, index) => (
                                            <tr key={user.id} className="hover:bg-muted/30">
                                                <td className="py-3 px-4">
                                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                                        index === 0 ? 'bg-yellow-500' :
                                                        index === 1 ? 'bg-gray-400' :
                                                        index === 2 ? 'bg-amber-700' : 'bg-gray-300'
                                                    }`}>
                                                        {index + 1}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 font-medium text-foreground">{user.username}</td>
                                                <td className="py-3 px-4 text-muted-foreground">{user.role}</td>
                                                <td className="py-3 px-4 text-center">{user.loginCount}</td>
                                                <td className="py-3 px-4 text-center font-medium text-green-600">{user.totalOperations}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {/* Inactive Users Tab */}
            {activeTab === 'inactive' && (
                <InactiveUsersTable
                    users={inactiveUsersData?.users || []}
                    total={inactiveUsersData?.total || 0}
                    page={page}
                    limit={20}
                    totalPages={inactiveUsersData?.totalPages || 1}
                    filters={filters}
                    loading={usersLoading}
                    onFiltersChange={handleFiltersChange}
                    onPageChange={setPage}
                    onViewUser={handleViewUser}
                />
            )}
        </div>
    )
}
