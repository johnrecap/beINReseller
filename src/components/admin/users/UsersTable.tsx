'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Edit2, Ban, CheckCircle, Wallet, KeyRound, ArrowRight, ArrowLeft, BarChart2, Trash2, Users, X } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import CreateUserDialog from './CreateUserDialog'
import EditUserDialog from './EditUserDialog'
import AddBalanceDialog from './AddBalanceDialog'
import ResetPasswordDialog from './ResetPasswordDialog'
import UserStatsDialog from './UserStatsDialog'
import { useTranslation } from '@/hooks/useTranslation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// User type for Users tab (with creator info)
interface User {
    id: string
    username: string
    email: string
    role: string
    balance: number
    isActive: boolean
    createdAt: string
    lastLoginAt: string | null
    transactionCount?: number
    operationCount?: number
    // Creator info (for users tab)
    creatorId?: string | null
    creatorUsername?: string | null
    creatorEmail?: string | null
    creatorRole?: string | null
}

// Distributor type (for distributors tab)
interface Distributor {
    id: string
    username: string
    email: string
    role: string
    balance: number
    isActive: boolean
    createdAt: string
    lastLoginAt: string | null
    managedUsersCount: number
}

interface TabCounts {
    distributors: number
    users: number
}

type TabType = 'distributors' | 'users'

export default function UsersTable() {
    const { t, language } = useTranslation()
    const [activeTab, setActiveTab] = useState<TabType>('distributors')
    const [users, setUsers] = useState<User[]>([])
    const [distributors, setDistributors] = useState<Distributor[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [counts, setCounts] = useState<TabCounts>({ distributors: 0, users: 0 })
    
    // Filter users by specific distributor
    const [filterManagerId, setFilterManagerId] = useState<string | null>(null)
    const [filterManagerName, setFilterManagerName] = useState<string | null>(null)

    // Dialog States
    const [isCreateOpen, setCreateOpen] = useState(false)
    const [editUser, setEditUser] = useState<User | Distributor | null>(null)
    const [balanceUser, setBalanceUser] = useState<User | Distributor | null>(null)
    const [resetUser, setResetUser] = useState<User | Distributor | null>(null)
    const [statsUser, setStatsUser] = useState<User | Distributor | null>(null)

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

    // Reset page when tab or search changes
    useEffect(() => {
        setPage(1)
    }, [activeTab, debouncedSearch, filterManagerId])

    // Fetch counts for tab badges
    const fetchCounts = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users/counts')
            const data = await res.json()
            if (res.ok) {
                setCounts(data)
            }
        } catch (error) {
            console.error('Failed to fetch counts', error)
        }
    }, [])

    useEffect(() => {
        fetchCounts()
    }, [fetchCounts])

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            let url = `/api/admin/users?page=${page}&limit=10&search=${debouncedSearch}&roleFilter=${activeTab}`
            
            // Add managerId filter for users tab
            if (activeTab === 'users' && filterManagerId) {
                url += `&managerId=${filterManagerId}`
            }
            
            const res = await fetch(url)
            const data = await res.json()
            if (res.ok) {
                if (activeTab === 'distributors') {
                    setDistributors(data.users)
                } else {
                    setUsers(data.users)
                }
                setTotalPages(data.totalPages)
            }
        } catch (error) {
            console.error('Failed to fetch data', error)
        } finally {
            setLoading(false)
        }
    }, [page, debouncedSearch, activeTab, filterManagerId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleToggleStatus = async (user: User | Distributor) => {
        if (!confirm(user.isActive ? t.admin.users.actions.disableConfirm : t.admin.users.actions.enableConfirm)) return

        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !user.isActive }),
            })
            if (res.ok) {
                fetchData()
                fetchCounts()
            }
        } catch (error) {
            console.error('Failed to update status', error)
        }
    }

    const handleDeleteUser = async (user: User | Distributor) => {
        const confirmMessage = `${t.admin?.users?.messages?.deleteConfirmFull || 'Are you sure you want to permanently delete'} "${user.username}"? ${t.admin?.users?.messages?.deleteDataWarning || 'All associated data will be deleted.'}`
        if (!confirm(confirmMessage)) return

        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'DELETE',
            })
            const data = await res.json()
            if (res.ok) {
                fetchData()
                fetchCounts()
                alert(t.admin?.users?.messages?.deleteSuccess || 'User deleted successfully')
            } else {
                alert(data.error || t.admin?.users?.messages?.deleteFailed || 'Failed to delete user')
            }
        } catch (error) {
            console.error('Failed to delete user', error)
            alert(t.admin?.users?.messages?.deleteError || 'An error occurred while deleting user')
        }
    }

    // Handle distributor row click - filter users by this distributor
    const handleDistributorClick = (distributor: Distributor) => {
        setFilterManagerId(distributor.id)
        setFilterManagerName(distributor.username)
        setActiveTab('users')
    }

    // Clear distributor filter
    const clearManagerFilter = () => {
        setFilterManagerId(null)
        setFilterManagerName(null)
    }

    // Get default role for create dialog based on active tab
    const getDefaultRole = () => {
        return activeTab === 'distributors' ? 'MANAGER' : 'USER'
    }

    // Render distributor row
    const renderDistributorRow = (distributor: Distributor) => (
        <tr 
            key={distributor.id} 
            className="hover:bg-secondary transition-colors group cursor-pointer"
            onClick={() => handleDistributorClick(distributor)}
        >
            <td className="px-4 py-3">
                <div>
                    <p className="font-semibold text-foreground">{distributor.username}</p>
                    <p className="text-xs text-muted-foreground dir-ltr text-right">{distributor.email}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        distributor.role === 'ADMIN' 
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    }`}>
                        {distributor.role === 'ADMIN' ? (t.admin?.users?.roles?.admin || 'Admin') : (t.admin?.users?.roles?.manager || 'Manager')}
                    </span>
                </div>
            </td>
            <td className="px-4 py-3">
                <p className="font-bold text-foreground dir-ltr text-right">{(distributor.balance ?? 0).toLocaleString()} {t.header.currency}</p>
            </td>
            <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${distributor.isActive
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                    {distributor.isActive ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                    {distributor.isActive ? t.admin.users.table.active : t.admin.users.table.inactive}
                </span>
            </td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{distributor.managedUsersCount}</span>
                    <span className="text-xs text-muted-foreground">{t.admin?.users?.tabs?.users || 'users'}</span>
                </div>
            </td>
            <td className="px-4 py-3 text-xs text-muted-foreground">
                {format(new Date(distributor.createdAt), 'dd/MM/yyyy', { locale: currentLocale })}
            </td>
            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => setStatsUser(distributor)}
                        className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 rounded-lg transition-colors"
                        title={t.admin?.users?.actions?.viewStats || 'User Statistics'}
                    >
                        <BarChart2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setBalanceUser(distributor)}
                        className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                        title={t.admin.users.actions.addBalance}
                    >
                        <Wallet className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setResetUser(distributor)}
                        className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"
                        title={t.admin.users.actions.resetPassword}
                    >
                        <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setEditUser(distributor)}
                        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                        title={t.admin.users.actions.edit}
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleToggleStatus(distributor)}
                        className={`p-1.5 rounded-lg transition-colors ${distributor.isActive
                            ? 'hover:bg-red-50 text-red-600'
                            : 'hover:bg-green-50 text-green-600'
                            }`}
                        title={distributor.isActive ? t.admin.users.actions.disable : t.admin.users.actions.enable}
                    >
                        {distributor.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => handleDeleteUser(distributor)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 rounded-lg transition-colors"
                        title={t.admin?.users?.actions?.permanentDelete || 'Permanent Delete'}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </td>
        </tr>
    )

    // Render user row
    const renderUserRow = (user: User) => (
        <tr key={user.id} className="hover:bg-secondary transition-colors group">
            <td className="px-4 py-3">
                <div>
                    <p className="font-semibold text-foreground">{user.username}</p>
                    <p className="text-xs text-muted-foreground dir-ltr text-right">{user.email}</p>
                </div>
            </td>
            <td className="px-4 py-3">
                {user.creatorUsername ? (
                    <div>
                        <p className="font-medium text-foreground">{user.creatorUsername}</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            user.creatorRole === 'ADMIN' 
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}>
                            {user.creatorRole === 'ADMIN' ? (t.admin?.users?.roles?.admin || 'Admin') : (t.admin?.users?.roles?.manager || 'Manager')}
                        </span>
                    </div>
                ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                )}
            </td>
            <td className="px-4 py-3">
                <p className="font-bold text-foreground dir-ltr text-right">{(user.balance ?? 0).toLocaleString()} {t.header.currency}</p>
            </td>
            <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.isActive
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                    {user.isActive ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                    {user.isActive ? t.admin.users.table.active : t.admin.users.table.inactive}
                </span>
            </td>
            <td className="px-4 py-3 text-xs text-muted-foreground">
                <p>{user.operationCount ?? 0} {t.admin.users.table.operation}</p>
                <p>{user.transactionCount ?? 0} {t.admin.users.table.transaction}</p>
            </td>
            <td className="px-4 py-3 text-xs text-muted-foreground">
                {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: currentLocale })}
            </td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => setStatsUser(user)}
                        className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 rounded-lg transition-colors"
                        title={t.admin?.users?.actions?.viewStats || 'User Statistics'}
                    >
                        <BarChart2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setBalanceUser(user)}
                        className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                        title={t.admin.users.actions.addBalance}
                    >
                        <Wallet className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setResetUser(user)}
                        className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"
                        title={t.admin.users.actions.resetPassword}
                    >
                        <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setEditUser(user)}
                        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                        title={t.admin.users.actions.edit}
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleToggleStatus(user)}
                        className={`p-1.5 rounded-lg transition-colors ${user.isActive
                            ? 'hover:bg-red-50 text-red-600'
                            : 'hover:bg-green-50 text-green-600'
                            }`}
                        title={user.isActive ? t.admin.users.actions.disable : t.admin.users.actions.enable}
                    >
                        {user.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 rounded-lg transition-colors"
                        title={t.admin?.users?.actions?.permanentDelete || 'Permanent Delete'}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </td>
        </tr>
    )

    // Render loading skeleton
    const renderLoadingSkeleton = (colCount: number) => (
        [...Array(5)].map((_, i) => (
            <tr key={i} className="animate-pulse">
                {[...Array(colCount)].map((_, j) => (
                    <td key={j} className="p-4"><div className="h-4 bg-muted rounded w-20"></div></td>
                ))}
            </tr>
        ))
    )

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <TabsList className="bg-muted/50">
                        <TabsTrigger value="distributors" className="gap-2">
                            {t.admin?.users?.tabs?.distributors || 'الموزعين'}
                            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                {counts.distributors}
                            </span>
                        </TabsTrigger>
                        <TabsTrigger value="users" className="gap-2">
                            {t.admin?.users?.tabs?.users || 'المستخدمين'}
                            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                {counts.users}
                            </span>
                        </TabsTrigger>
                    </TabsList>
                    
                    {/* Header Actions */}
                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                            <input
                                type="text"
                                placeholder={t.admin.users.actions.searchPlaceholder}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pr-10 pl-4 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground"
                            />
                        </div>
                        <button
                            onClick={() => setCreateOpen(true)}
                            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                        >
                            <Plus className="w-5 h-5" />
                            <span>
                                {activeTab === 'distributors' 
                                    ? (t.admin?.users?.actions?.addDistributor || 'إضافة موزع')
                                    : (t.admin?.users?.actions?.addUser || 'إضافة مستخدم')
                                }
                            </span>
                        </button>
                    </div>
                </div>

                {/* Filter badge for users tab */}
                {activeTab === 'users' && filterManagerId && (
                    <div className="flex items-center gap-2 mt-4">
                        <span className="text-sm text-muted-foreground">{t.admin?.users?.filters?.filterByDistributor || 'تصفية حسب الموزع'}:</span>
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                            {filterManagerName}
                            <button 
                                onClick={clearManagerFilter}
                                className="p-0.5 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    </div>
                )}

                {/* Distributors Tab Content */}
                <TabsContent value="distributors">
                    <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-secondary border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.user}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.balance}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.status}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin?.users?.table?.managedUsersCount || 'عدد المستخدمين'}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.created}</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground pl-6">{t.admin.users.table.actions}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {loading ? (
                                        renderLoadingSkeleton(6)
                                    ) : distributors.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-muted-foreground">{t.admin?.users?.table?.noDistributors || 'لا يوجد موزعين'}</td>
                                        </tr>
                                    ) : (
                                        distributors.map(renderDistributorRow)
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
                                        title={t.pagination?.previousPage || 'Previous Page'}
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages}
                                        className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={t.pagination?.nextPage || 'Next Page'}
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* Users Tab Content */}
                <TabsContent value="users">
                    <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-secondary border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.user}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin?.users?.table?.manager || 'الموزع'}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.balance}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.status}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.activity}</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.created}</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground pl-6">{t.admin.users.table.actions}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {loading ? (
                                        renderLoadingSkeleton(7)
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-muted-foreground">{t.admin.users.table.noUsers}</td>
                                        </tr>
                                    ) : (
                                        users.map(renderUserRow)
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
                                        title={t.pagination?.previousPage || 'Previous Page'}
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages}
                                        className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={t.pagination?.nextPage || 'Next Page'}
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Dialogs */}
            <CreateUserDialog
                isOpen={isCreateOpen}
                onClose={() => setCreateOpen(false)}
                onSuccess={() => {
                    fetchData()
                    fetchCounts()
                }}
                defaultRole={getDefaultRole()}
            />
            <EditUserDialog
                isOpen={!!editUser}
                onClose={() => setEditUser(null)}
                onSuccess={() => {
                    fetchData()
                    fetchCounts()
                }}
                user={editUser}
            />
            <AddBalanceDialog
                isOpen={!!balanceUser}
                onClose={() => setBalanceUser(null)}
                onSuccess={fetchData}
                userId={balanceUser?.id || null}
                username={balanceUser?.username || null}
            />
            <ResetPasswordDialog
                isOpen={!!resetUser}
                onClose={() => setResetUser(null)}
                userId={resetUser?.id || null}
                username={resetUser?.username || null}
            />
            <UserStatsDialog
                isOpen={!!statsUser}
                onClose={() => setStatsUser(null)}
                userId={statsUser?.id || null}
                username={statsUser?.username || null}
            />
        </div>
    )
}
