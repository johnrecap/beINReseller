'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useState, useEffect, useCallback } from 'react'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { Search, User, ArrowRight, ArrowLeft, Clock, ChevronDown, ChevronUp, LogIn, ShieldX, LogOut, RefreshCw, Radio, Zap, CreditCard, Plus, Layers, Play, CheckCircle, XCircle, Ban, HeartOff, DollarSign, ArrowDownLeft, ArrowRightLeft, Wallet, UserPlus, UserMinus, KeyRound, Settings, Wrench, UserCog, Activity, Shield, Users } from 'lucide-react'
import { format as formatDate } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'
import { getActionInfo, formatLogDetails, categoryStyles, outcomeStyles, filterGroups, type ActionCategory } from '@/lib/activityLogHelpers'
import DatePickerCalendar from '@/components/ui/DatePickerCalendar'

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
    const { load, loading, error, cancel } = usePanelRequest()
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [actionFilter, setActionFilter] = useState('')
    const [dateFilter, setDateFilter] = useState<Date | null>(null)
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [expandedRow, setExpandedRow] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }

    const currentLocale = localeMap[language as keyof typeof localeMap] || ar

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 500)
        return () => clearTimeout(timer)
    }, [search])

    const fetchLogs = useCallback(() => {
        const params = new URLSearchParams({ page: String(page), limit: '20', search: debouncedSearch, action: actionFilter })
        if (dateFilter) {
            const dateStr = formatDate(dateFilter, 'yyyy-MM-dd')
            params.set('dateFrom', dateStr)
            params.set('dateTo', dateStr)
        }
        setLogs([])
        return load<{ logs: Log[]; totalPages: number }>(`/api/admin/logs?${params}`, data => {
            const lastPage = Math.max(1, data.totalPages || 1)
            setTotalPages(lastPage)
            if (page > lastPage) { setPage(lastPage); return }
            setLogs(data.logs)
        })
    }, [page, debouncedSearch, actionFilter, dateFilter, load])

    useEffect(() => {
        const timer = window.setTimeout(() => void fetchLogs(), 0)
        return () => { window.clearTimeout(timer); cancel() }
    }, [fetchLogs, cancel])

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            await fetchLogs()
        } finally {
            setRefreshing(false)
        }
    }

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
            <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-xl shadow-sm border border-border">
                <div className="relative min-w-0 flex-1 basis-56">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                    <input
                        type="text"
                        placeholder={t.admin.logs.filters.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full ps-10 pe-4 py-2 border border-border rounded-lg focus:outline-none focus:border-blue-500 bg-background text-foreground"
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
                <DatePickerCalendar
                    selectedDate={dateFilter}
                    onChange={(date) => { setDateFilter(date); setPage(1) }}
                    placeholder="Filter by date"
                />
                <button
                    onClick={handleRefresh}
                    disabled={loading || refreshing}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-secondary disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Refresh logs"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
            </div>

            {error !== null && <PanelLoadError status={error} retry={() => void fetchLogs()} />}
            {/* Logs List */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border" hidden={error !== null}>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full">
                        <TableHeader className="bg-secondary border-b border-border">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.user}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.action}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.details}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.ip}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.logs.table.time}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i} className="animate-pulse">
                                        <TableCell className="p-4" colSpan={5}>
                                            <div className="h-4 bg-muted rounded w-full"></div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">{t.admin.logs.table.noLogs}</TableCell>
                                </TableRow>
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
                                            <TableRow
                                                key={log.id}
                                                className="hover:bg-secondary/50 transition-colors cursor-pointer"
                                                onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                                            >
                                                {/* User */}
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                        <span className="font-medium text-foreground">{log.username}</span>
                                                    </div>
                                                </TableCell>

                                                {/* Action — Category badge + label + outcome */}
                                                <TableCell className="px-4 py-3">
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
                                                </TableCell>

                                                {/* Details — formatted */}
                                                <TableCell className="px-4 py-3">
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
                                                </TableCell>

                                                {/* IP */}
                                                <TableCell className="px-4 py-3">
                                                    <span className="font-mono text-xs text-muted-foreground">{log.ipAddress || '—'}</span>
                                                </TableCell>

                                                {/* Time */}
                                                <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDate(new Date(log.createdAt), 'dd/MM/yyyy HH:mm', { locale: currentLocale })}
                                                    </div>
                                                </TableCell>
                                            </TableRow>

                                            {/* Expanded details row */}
                                            {isExpanded && (
                                                <TableRow key={`${log.id}-expanded`} className="bg-secondary/30">
                                                    <TableCell colSpan={5} className="px-6 py-3">
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
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
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
