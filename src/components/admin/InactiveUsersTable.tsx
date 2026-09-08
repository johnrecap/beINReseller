'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useState } from 'react'
import { SortableTableHead } from '@/components/ui/PanelTableControls'
import { useTranslation } from '@/hooks/useTranslation'
import { ActivityStatusBadge } from '@/components/ui/ActivityStatusBadge'
import { INACTIVITY_FILTER_OPTIONS } from '@/lib/activity-status'
import type { InactiveUser } from '@/types/activity'
import {
    ChevronLeft,
    ChevronRight,
    Search,
    Filter,
    Eye,
    ArrowUpDown
} from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'

interface InactiveUsersTableProps {
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
    loading?: boolean
    onFiltersChange: (filters: Partial<InactiveUsersTableProps['filters']>) => void
    onPageChange: (page: number) => void
    onViewUser?: (userId: string) => void
}

export function InactiveUsersTable({
    users,
    total,
    page,
    totalPages,
    filters,
    loading,
    onFiltersChange,
    onPageChange,
    onViewUser
}: InactiveUsersTableProps) {
    const { t, locale } = useTranslation()
    const dir = locale === 'ar' ? 'rtl' : 'ltr'
    const dateLocale = locale === 'ar' ? ar : locale === 'bn' ? bn : enUS

    const [now] = useState(Date.now)
    const [searchInput, setSearchInput] = useState(filters.search || '')

    const handleSearch = () => {
        onFiltersChange({ search: searchInput || undefined })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch()
        }
    }

    const toggleSort = (field: string) => {
        if (filters.sortBy === field) {
            onFiltersChange({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })
        } else {
            onFiltersChange({ sortBy: field, sortOrder: 'asc' })
        }
    }

    const formatDate = (date: Date | null) => {
        if (!date) return t.activity?.table?.neverLoggedIn || 'Never'
        return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: dateLocale })
    }

    const roleLabels: Record<string, string> = {
        ADMIN: t.admin.users.roles.admin,
        MANAGER: t.admin.users.roles.manager,
        USER: t.admin.users.roles.user,
    }
    const formatActivityAge = (date: Date | null) => {
        if (!date) return t.activity.table.neverLoggedIn
        const days = Math.max(0, Math.floor((now - new Date(date).getTime()) / 86_400_000))
        if (days === 0) return t.activity.time.today
        if (days === 1) return t.activity.time.yesterday
        return t.activity.time.daysAgo.replace('{days}', new Intl.NumberFormat(locale).format(days))
    }

    return (
        <div className="bg-card rounded-xl border border-border overflow-hidden" dir={dir}>
            {/* Filters */}
            <div className="p-4 border-b border-border bg-muted/30">
                <div className="flex flex-wrap gap-3">
                    {/* Search */}
                    <div className="flex-1 min-w-[200px] max-w-sm">
                        <div className="relative">
                            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                aria-label={t.activity.filters.searchPlaceholder}
                                placeholder={t.activity?.filters?.searchPlaceholder || 'Search by name or email...'}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full ps-9 pe-4 py-2 rounded-lg border border-border bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                            />
                        </div>
                    </div>

                    {/* Inactivity Days Filter */}
                    <select
                        aria-label={t.activity.filters.inactiveSince}
                        value={filters.days}
                        onChange={(e) => onFiltersChange({ days: Number(e.target.value) })}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:ring-2 focus:ring-primary"
                    >
                        {INACTIVITY_FILTER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {t.activity.filters.inactiveSince} {t.activity.filters.daysCount.replace('{days}', new Intl.NumberFormat(locale).format(opt.value))}
                            </option>
                        ))}
                    </select>

                    {/* Role Filter */}
                    <select
                        aria-label={t.activity.table.role}
                        value={filters.role || ''}
                        onChange={(e) => onFiltersChange({ role: e.target.value || undefined })}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:ring-2 focus:ring-primary"
                    >
                        <option value="">{t.activity?.filters?.allRoles || 'All Roles'}</option>
                        <option value="USER">{roleLabels.USER}</option>
                        <option value="MANAGER">{roleLabels.MANAGER}</option>
                        <option value="ADMIN">{roleLabels.ADMIN}</option>
                    </select>

                    {/* Search Button */}
                    <button
                        aria-label={t.activity.filters.searchPlaceholder}
                        onClick={handleSearch}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                </div>

                {/* Results count */}
                <p className="text-sm text-muted-foreground mt-3">
                    {`${t.activity?.filters?.showing || 'Showing'} ${users.length} ${t.activity?.filters?.of || 'of'} ${total} ${t.activity?.filters?.inactiveUsers || 'inactive users'}`}
                </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <Table panel density="compact" className="w-full">
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                                {t.activity?.table?.user || 'User'}
                            </TableHead>
                            <TableHead className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                                {t.activity?.table?.role || 'Role'}
                            </TableHead>
                            <SortableTableHead
                                className="px-4 py-3 text-start text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                                direction={filters.sortBy === 'lastLogin' ? (filters.sortOrder === 'asc' ? 'asc' : 'desc') : undefined}
                                onSort={() => toggleSort('lastLogin')}
                            >
                                <span className="inline-flex items-center gap-1">
                                    {t.activity?.table?.lastLogin || 'Last Login'}
                                    <ArrowUpDown className="w-3 h-3" />
                                </span>
                            </SortableTableHead>
                            <SortableTableHead
                                className="px-4 py-3 text-start text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                                direction={filters.sortBy === 'lastOperation' ? (filters.sortOrder === 'asc' ? 'asc' : 'desc') : undefined}
                                onSort={() => toggleSort('lastOperation')}
                            >
                                <span className="inline-flex items-center gap-1">
                                    {t.activity?.table?.lastOperation || 'Last Operation'}
                                    <ArrowUpDown className="w-3 h-3" />
                                </span>
                            </SortableTableHead>
                            <TableHead className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                {t.activity?.table?.stats || 'Stats'}
                            </TableHead>
                            <TableHead className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                {t.activity?.table?.status || 'Status'}
                            </TableHead>
                            <TableHead className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                {t.activity?.table?.actions || 'Actions'}
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <TableRow key={i} className="animate-pulse">
                                    <TableCell className="px-4 py-4"><div className="h-4 bg-muted rounded w-32" /></TableCell>
                                    <TableCell className="px-4 py-4"><div className="h-4 bg-muted rounded w-16" /></TableCell>
                                    <TableCell className="px-4 py-4"><div className="h-4 bg-muted rounded w-24" /></TableCell>
                                    <TableCell className="px-4 py-4"><div className="h-4 bg-muted rounded w-24" /></TableCell>
                                    <TableCell className="px-4 py-4"><div className="h-4 bg-muted rounded w-16 mx-auto" /></TableCell>
                                    <TableCell className="px-4 py-4"><div className="h-6 bg-muted rounded-full w-20 mx-auto" /></TableCell>
                                    <TableCell className="px-4 py-4"><div className="h-8 bg-muted rounded w-8 mx-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                    {t.activity?.table?.noInactiveUsers || 'No inactive users found'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((user) => (
                                <TableRow key={user.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="px-4 py-4">
                                        <div>
                                            <p className="font-medium text-foreground">{user.username}</p>
                                            <p className="text-sm text-muted-foreground">{user.email}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-4">
                                        <span className="text-sm text-muted-foreground">
                                            {roleLabels[user.role] || user.role}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-4 py-4">
                                        <div>
                                            <p className="text-sm text-foreground">
                                                {formatDate(user.lastLoginAt)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatActivityAge(user.lastLoginAt)}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-4">
                                        <div>
                                            <p className="text-sm text-foreground">
                                                {formatDate(user.lastOperationAt)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatActivityAge(user.lastOperationAt)}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-4 text-center">
                                        <div className="text-sm">
                                            <p><span className="text-muted-foreground">{t.activity?.table?.logins || 'Logins:'}</span> {user.loginCount}</p>
                                            <p><span className="text-muted-foreground">{t.activity?.table?.operations || 'Ops:'}</span> {user.totalOperations}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-4 text-center">
                                        <ActivityStatusBadge status={user.activityStatus} />
                                    </TableCell>
                                    <TableCell className="px-4 py-4">
                                        <div className="flex items-center justify-center gap-1">
                                            {onViewUser && (
                                                <button
                                                    onClick={() => onViewUser(user.id)}
                                                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                                                    title={t.activity?.table?.actions || 'View Details'}
                                                >
                                                    <Eye className="w-4 h-4 text-muted-foreground" />
                                                </button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {`${t.admin?.logs?.pagination?.page || 'Page'} ${page} ${t.admin?.logs?.pagination?.of || 'of'} ${totalPages}`}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            aria-label={t.pagination.previousPage}
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {dir === 'rtl' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        </button>
                        <button
                            aria-label={t.pagination.nextPage}
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {dir === 'rtl' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default InactiveUsersTable
