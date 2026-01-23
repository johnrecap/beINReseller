'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Edit2, Ban, CheckCircle, Wallet, KeyRound, ArrowRight, ArrowLeft, BarChart2, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import CreateUserDialog from './CreateUserDialog'
import EditUserDialog from './EditUserDialog'
import AddBalanceDialog from './AddBalanceDialog'
import ResetPasswordDialog from './ResetPasswordDialog'
import UserStatsDialog from './UserStatsDialog'
import { useTranslation } from '@/hooks/useTranslation'

interface User {
    id: string
    username: string
    email: string
    role: string
    balance: number
    isActive: boolean
    createdAt: string
    transactionCount: number
    operationCount: number
}

export default function UsersTable() {
    const { t, language } = useTranslation()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Dialog States
    const [isCreateOpen, setCreateOpen] = useState(false)
    const [editUser, setEditUser] = useState<User | null>(null)
    const [balanceUser, setBalanceUser] = useState<User | null>(null)
    const [resetUser, setResetUser] = useState<User | null>(null)
    const [statsUser, setStatsUser] = useState<User | null>(null)

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

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/users?page=${page}&limit=10&search=${debouncedSearch}`)
            const data = await res.json()
            if (res.ok) {
                setUsers(data.users)
                setTotalPages(data.totalPages)
            }
        } catch (error) {
            console.error('Failed to fetch users', error)
        } finally {
            setLoading(false)
        }
    }, [page, debouncedSearch])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const handleToggleStatus = async (user: User) => {
        if (!confirm(user.isActive ? t.admin.users.actions.disableConfirm : t.admin.users.actions.enableConfirm)) return

        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !user.isActive }),
            })
            if (res.ok) fetchUsers()
        } catch (error) {
            console.error('Failed to update status', error)
        }
    }

    const handleDeleteUser = async (user: User) => {
        if (!confirm(`هل أنت متأكد من حذف "${user.username}" نهائياً؟ سيتم حذف جميع البيانات المرتبطة بهذا الحساب.`)) return

        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'DELETE',
            })
            const data = await res.json()
            if (res.ok) {
                fetchUsers()
                alert('تم حذف المستخدم بنجاح')
            } else {
                alert(data.error || 'فشل حذف المستخدم')
            }
        } catch (error) {
            console.error('Failed to delete user', error)
            alert('حدث خطأ أثناء حذف المستخدم')
        }
    }

    return (
        <div className="space-y-4">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
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
                    className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    <span>{t.admin.users.actions.addUser}</span>
                </button>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-secondary border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.user}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.balance}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.status}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.activity}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin.users.table.created}</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground pl-6">{t.admin.users.table.actions}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-16"></div></td>
                                        <td className="p-4"><div className="h-6 bg-muted rounded-full w-12"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-20"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-8 bg-muted rounded w-8"></div></td>
                                    </tr>
                                ))
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">{t.admin.users.table.noUsers}</td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-secondary transition-colors group">
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-semibold text-foreground">{user.username}</p>
                                                <p className="text-xs text-muted-foreground dir-ltr text-right">{user.email}</p>
                                            </div>
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
                                            <p>{user.operationCount} {t.admin.users.table.operation}</p>
                                            <p>{user.transactionCount} {t.admin.users.table.transaction}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: currentLocale })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => setStatsUser(user)}
                                                    className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 rounded-lg transition-colors"
                                                    title="إحصائيات المستخدم"
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
                                                    title="حذف نهائي"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
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
                                title="الصفحة السابقة"
                            >
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                title="الصفحة التالية"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Dialogs */}
            <CreateUserDialog
                isOpen={isCreateOpen}
                onClose={() => setCreateOpen(false)}
                onSuccess={fetchUsers}
            />
            <EditUserDialog
                isOpen={!!editUser}
                onClose={() => setEditUser(null)}
                onSuccess={fetchUsers}
                user={editUser}
            />
            <AddBalanceDialog
                isOpen={!!balanceUser}
                onClose={() => setBalanceUser(null)}
                onSuccess={fetchUsers}
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
