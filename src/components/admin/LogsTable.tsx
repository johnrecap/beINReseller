'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, User, ArrowRight, ArrowLeft, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Log {
    id: string
    userId: string
    username: string
    action: string
    details: string | Record<string, unknown>
    ipAddress: string
    createdAt: string
}

export default function LogsTable() {
    const { t, language } = useTranslation()
    const [logs, setLogs] = useState<Log[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [actionFilter, setActionFilter] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }

    const currentLocale = localeMap[language as keyof typeof localeMap] || ar

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
        if (action.includes('LOGIN')) return <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">{t.admin.logs.table.actions.login}</span>
        if (action.includes('CREATE')) return <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">{t.admin.logs.table.actions.create}</span>
        if (action.includes('UPDATE')) return <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">{t.admin.logs.table.actions.update}</span>
        if (action.includes('DELETE')) return <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">{t.admin.logs.table.actions.delete}</span>
        if (action.includes('BALANCE')) return <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-medium">{t.admin.logs.table.actions.balance}</span>
        return <span className="px-2 py-1 bg-muted text-muted-foreground rounded-full text-xs font-medium">{action}</span>
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-xl shadow-sm border border-border">
                <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                    <input
                        type="text"
                        placeholder={t.admin.logs.filters.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 border border-border rounded-lg focus:outline-none focus:border-blue-500 bg-background text-foreground"
                    />
                </div>
                <div>
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="w-full sm:w-48 px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-blue-500 bg-background text-foreground"
                    >
                        <option value="">{t.admin.logs.filters.allOperations}</option>
                        <option value="LOGIN">{t.admin.logs.filters.login}</option>
                        <option value="ADMIN_UPDATE_SETTINGS">{t.admin.logs.filters.updateSettings}</option>
                        <option value="ADMIN_ADD_BALANCE">{t.admin.logs.filters.addBalance}</option>
                        <option value="ADMIN_CREATE_USER">{t.admin.logs.filters.createUser}</option>
                        <option value="ADMIN_RESET_PASSWORD">{t.admin.logs.filters.resetPassword}</option>
                    </select>
                </div>
            </div>

            {/* Logs List */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-secondary border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.user}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.action}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.details}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.ip}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.time}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="p-4" colSpan={5}>
                                            <div className="h-4 bg-muted rounded w-full"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-muted-foreground">{t.admin.logs.table.noLogs}</td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-secondary transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-medium text-foreground">{log.username}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {getActionBadge(log.action)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-muted-foreground max-w-xs truncate" title={JSON.stringify(log.details)}>
                                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-xs text-muted-foreground">{log.ipAddress}</span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm', { locale: currentLocale })}
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
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                            {t.admin.logs.pagination.page} {page} {t.admin.logs.pagination.of} {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
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
