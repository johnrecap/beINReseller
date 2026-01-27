'use client'

import { useState } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { ActivityStatusBadge } from '@/components/ui/ActivityStatusBadge'
import { INACTIVITY_FILTER_OPTIONS, formatDaysSinceActivity } from '@/lib/activity-status'
import type { InactiveUser, ActivityStatusType } from '@/types/activity'
import { 
    ChevronLeft, 
    ChevronRight, 
    Search, 
    Filter, 
    Eye,
    Mail,
    UserX,
    ArrowUpDown
} from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'

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
    limit,
    totalPages,
    filters,
    loading,
    onFiltersChange,
    onPageChange,
    onViewUser
}: InactiveUsersTableProps) {
    const { locale } = useTranslation()
    const dir = locale === 'ar' ? 'rtl' : 'ltr'
    const dateLocale = locale === 'ar' ? ar : enUS
    
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
        if (!date) return locale === 'ar' ? 'لم يسجل' : 'Never'
        return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: dateLocale })
    }
    
    const roleLabels: Record<string, { ar: string; en: string }> = {
        ADMIN: { ar: 'مدير', en: 'Admin' },
        MANAGER: { ar: 'موزع', en: 'Manager' },
        USER: { ar: 'مستخدم', en: 'User' }
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
                                placeholder={locale === 'ar' ? 'بحث بالاسم أو البريد...' : 'Search by name or email...'}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full ps-9 pe-4 py-2 rounded-lg border border-border bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                            />
                        </div>
                    </div>
                    
                    {/* Inactivity Days Filter */}
                    <select
                        value={filters.days}
                        onChange={(e) => onFiltersChange({ days: Number(e.target.value) })}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:ring-2 focus:ring-primary"
                    >
                        {INACTIVITY_FILTER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {locale === 'ar' ? `غير نشط منذ ${opt.label.ar}` : `Inactive for ${opt.label.en}`}
                            </option>
                        ))}
                    </select>
                    
                    {/* Role Filter */}
                    <select
                        value={filters.role || ''}
                        onChange={(e) => onFiltersChange({ role: e.target.value || undefined })}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:ring-2 focus:ring-primary"
                    >
                        <option value="">{locale === 'ar' ? 'كل الأدوار' : 'All Roles'}</option>
                        <option value="USER">{roleLabels.USER[locale as 'ar' | 'en']}</option>
                        <option value="MANAGER">{roleLabels.MANAGER[locale as 'ar' | 'en']}</option>
                        <option value="ADMIN">{roleLabels.ADMIN[locale as 'ar' | 'en']}</option>
                    </select>
                    
                    {/* Search Button */}
                    <button
                        onClick={handleSearch}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                </div>
                
                {/* Results count */}
                <p className="text-sm text-muted-foreground mt-3">
                    {locale === 'ar' 
                        ? `عرض ${users.length} من ${total} مستخدم غير نشط`
                        : `Showing ${users.length} of ${total} inactive users`
                    }
                </p>
            </div>
            
            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                                {locale === 'ar' ? 'المستخدم' : 'User'}
                            </th>
                            <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                                {locale === 'ar' ? 'الدور' : 'Role'}
                            </th>
                            <th 
                                className="px-4 py-3 text-start text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                                onClick={() => toggleSort('lastLogin')}
                            >
                                <span className="inline-flex items-center gap-1">
                                    {locale === 'ar' ? 'آخر دخول' : 'Last Login'}
                                    <ArrowUpDown className="w-3 h-3" />
                                </span>
                            </th>
                            <th 
                                className="px-4 py-3 text-start text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                                onClick={() => toggleSort('lastOperation')}
                            >
                                <span className="inline-flex items-center gap-1">
                                    {locale === 'ar' ? 'آخر عملية' : 'Last Operation'}
                                    <ArrowUpDown className="w-3 h-3" />
                                </span>
                            </th>
                            <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                {locale === 'ar' ? 'الإحصائيات' : 'Stats'}
                            </th>
                            <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                {locale === 'ar' ? 'الحالة' : 'Status'}
                            </th>
                            <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                {locale === 'ar' ? 'الإجراءات' : 'Actions'}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-4 py-4"><div className="h-4 bg-muted rounded w-32" /></td>
                                    <td className="px-4 py-4"><div className="h-4 bg-muted rounded w-16" /></td>
                                    <td className="px-4 py-4"><div className="h-4 bg-muted rounded w-24" /></td>
                                    <td className="px-4 py-4"><div className="h-4 bg-muted rounded w-24" /></td>
                                    <td className="px-4 py-4"><div className="h-4 bg-muted rounded w-16 mx-auto" /></td>
                                    <td className="px-4 py-4"><div className="h-6 bg-muted rounded-full w-20 mx-auto" /></td>
                                    <td className="px-4 py-4"><div className="h-8 bg-muted rounded w-8 mx-auto" /></td>
                                </tr>
                            ))
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                    {locale === 'ar' ? 'لا يوجد مستخدمين غير نشطين' : 'No inactive users found'}
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-4">
                                        <div>
                                            <p className="font-medium text-foreground">{user.username}</p>
                                            <p className="text-sm text-muted-foreground">{user.email}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-sm text-muted-foreground">
                                            {roleLabels[user.role]?.[locale as 'ar' | 'en'] || user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div>
                                            <p className="text-sm text-foreground">
                                                {formatDate(user.lastLoginAt)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDaysSinceActivity(
                                                    user.lastLoginAt 
                                                        ? Math.floor((Date.now() - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24))
                                                        : null,
                                                    locale as 'ar' | 'en'
                                                )}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div>
                                            <p className="text-sm text-foreground">
                                                {formatDate(user.lastOperationAt)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDaysSinceActivity(
                                                    user.lastOperationAt 
                                                        ? Math.floor((Date.now() - new Date(user.lastOperationAt).getTime()) / (1000 * 60 * 60 * 24))
                                                        : null,
                                                    locale as 'ar' | 'en'
                                                )}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <div className="text-sm">
                                            <p><span className="text-muted-foreground">{locale === 'ar' ? 'دخول:' : 'Logins:'}</span> {user.loginCount}</p>
                                            <p><span className="text-muted-foreground">{locale === 'ar' ? 'عمليات:' : 'Ops:'}</span> {user.totalOperations}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <ActivityStatusBadge status={user.activityStatus} />
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center justify-center gap-1">
                                            {onViewUser && (
                                                <button
                                                    onClick={() => onViewUser(user.id)}
                                                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                                                    title={locale === 'ar' ? 'عرض التفاصيل' : 'View Details'}
                                                >
                                                    <Eye className="w-4 h-4 text-muted-foreground" />
                                                </button>
                                            )}
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
                <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {locale === 'ar'
                            ? `صفحة ${page} من ${totalPages}`
                            : `Page ${page} of ${totalPages}`
                        }
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {dir === 'rtl' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        </button>
                        <button
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
