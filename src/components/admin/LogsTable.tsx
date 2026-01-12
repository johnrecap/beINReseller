'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Calendar, User, Shield, ArrowRight, ArrowLeft, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

interface Log {
    id: string
    userId: string
    username: string
    action: string
    details: any
    ipAddress: string
    createdAt: string
}

export default function LogsTable() {
    const [logs, setLogs] = useState<Log[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [actionFilter, setActionFilter] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                search: debouncedSearch,
                action: actionFilter
            })

            const res = await fetch(`/api/admin/logs?${params}`)
            const data = await res.json()
            if (res.ok) {
                setLogs(data.logs)
                setTotalPages(data.totalPages)
            }
        } catch (error) {
            console.error('Failed to fetch logs', error)
        } finally {
            setLoading(false)
        }
    }, [page, debouncedSearch, actionFilter])

    useEffect(() => {
        fetchLogs()
    }, [fetchLogs])

    const getActionBadge = (action: string) => {
        if (action.includes('LOGIN')) return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">تسجيل دخول</span>
        if (action.includes('CREATE')) return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">إنشاء</span>
        if (action.includes('UPDATE')) return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">تحديث</span>
        if (action.includes('DELETE')) return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">حذف</span>
        if (action.includes('BALANCE')) return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">رصيد</span>
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{action}</span>
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="بحث (مستخدم، IP، تفاصيل)..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                </div>
                <div>
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="w-full sm:w-48 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                    >
                        <option value="">جميع العمليات</option>
                        <option value="LOGIN">تسجيل دخول</option>
                        <option value="ADMIN_UPDATE_SETTINGS">تعديل إعدادات</option>
                        <option value="ADMIN_ADD_BALANCE">شحن رصيد</option>
                        <option value="ADMIN_CREATE_USER">إضافة موزع</option>
                        <option value="ADMIN_RESET_PASSWORD">تغيير كلمة مرور</option>
                    </select>
                </div>
            </div>

            {/* Logs List */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">المستخدم</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">العملية</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">التفاصيل</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">IP</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">التوقيت</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="p-4" colSpan={5}>
                                            <div className="h-4 bg-gray-100 rounded w-full"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400">لا توجد سجلات</td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-gray-400" />
                                                <span className="font-medium text-gray-800">{log.username}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {getActionBadge(log.action)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-gray-600 max-w-xs truncate" title={JSON.stringify(log.details)}>
                                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-xs text-gray-500">{log.ipAddress}</span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm', { locale: ar })}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                            صفحة {page} من {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
