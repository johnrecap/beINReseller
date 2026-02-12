'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, User, ArrowRight, ArrowLeft, Clock, ChevronDown, ChevronUp, LogIn, ShieldX, LogOut, RefreshCw, Radio, Zap, CreditCard, Plus, Layers, Play, CheckCircle, XCircle, Ban, HeartOff, DollarSign, ArrowDownLeft, ArrowRightLeft, Wallet, UserPlus, UserMinus, KeyRound, Settings, Wrench, UserCog, Activity, Shield, Users } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'
import { getActionInfo, formatLogDetails, categoryStyles, outcomeStyles, filterGroups, type ActionCategory } from '@/lib/activityLogHelpers'

// Map icon name strings to Lucide components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    LogIn, ShieldX, LogOut, RefreshCw, Search: Search, Radio, Zap, CreditCard, Plus, Layers, Play,
    CheckCircle, XCircle, Ban, Clock, HeartOff, DollarSign, ArrowDownLeft, ArrowRightLeft, Wallet,
    UserPlus, UserMinus, KeyRound, Settings, Wrench, UserCog, Activity, Shield, Users
}

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
    const [expandedRow, setExpandedRow] = useState<string | null>(null)

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

    // Category icon component
    const getCategoryIcon = (category: ActionCategory) => {
        const categoryIconMap: Record<ActionCategory, React.ComponentType<{ className?: string }>> = {
            auth: Shield,
            operations: Activity,
            balance: DollarSign,
            admin: Wrench,
            manager: Users,
            user: User,
            system: Activity
        }
        return categoryIconMap[category]
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
                        onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
                        className="w-full sm:w-56 px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-blue-500 bg-background text-foreground"
                    >
                        <option value="">{t.admin.logs.filters.allOperations}</option>
                        {filterGroups.map(group => (
                            <optgroup key={group.label} label={`── ${group.label} ──`}>
                                {group.options.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </optgroup>
                        ))}
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
                                logs.map((log) => {
                                    const info = getActionInfo(log.action)
                                    const catStyle = categoryStyles[info.category]
                                    const outStyle = outcomeStyles[info.outcome]
                                    const formattedDetails = formatLogDetails(log.details, log.action)
                                    const isExpanded = expandedRow === log.id
                                    const IconComponent = iconMap[info.icon] || Activity
                                    const CategoryIcon = getCategoryIcon(info.category)

                                    return (
                                        <>
                                            <tr
                                                key={log.id}
                                                className="hover:bg-secondary/50 transition-colors cursor-pointer"
                                                onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                                            >
                                                {/* User */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                        <span className="font-medium text-foreground">{log.username}</span>
                                                    </div>
                                                </td>

                                                {/* Action — Category badge + label + outcome */}
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-1.5">
                                                        {/* Category badge */}
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${catStyle.bg} ${catStyle.text}`}>
                                                                <CategoryIcon className="w-3 h-3" />
                                                                {catStyle.label}
                                                            </span>
                                                        </div>
                                                        {/* Action label with outcome icon */}
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`text-sm font-medium ${outStyle.color}`}>
                                                                {outStyle.icon}
                                                            </span>
                                                            <IconComponent className={`w-3.5 h-3.5 ${catStyle.text}`} />
                                                            <span className="text-sm text-foreground font-medium">
                                                                {info.label}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Details — formatted */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <p className="text-sm text-muted-foreground max-w-xs truncate" title={formattedDetails}>
                                                            {formattedDetails}
                                                        </p>
                                                        {formattedDetails !== '—' && (
                                                            isExpanded
                                                                ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                                                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                                        )}
                                                    </div>
                                                </td>

                                                {/* IP */}
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-xs text-muted-foreground">{log.ipAddress || '—'}</span>
                                                </td>

                                                {/* Time */}
                                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm', { locale: currentLocale })}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded details row */}
                                            {isExpanded && (
                                                <tr key={`${log.id}-expanded`} className="bg-secondary/30">
                                                    <td colSpan={5} className="px-6 py-3">
                                                        <div className="text-xs">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="text-muted-foreground font-medium">Raw Action:</span>
                                                                <code className="px-2 py-0.5 bg-muted rounded text-foreground font-mono">{log.action}</code>
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground font-medium">Full Details:</span>
                                                                <pre className="mt-1 p-3 bg-muted rounded-lg text-foreground font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                                                    {typeof log.details === 'string'
                                                                        ? (() => { try { return JSON.stringify(JSON.parse(log.details), null, 2) } catch { return log.details } })()
                                                                        : JSON.stringify(log.details, null, 2)
                                                                    }
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    )
                                })
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
