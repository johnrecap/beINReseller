'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useState, useEffect, useCallback } from 'react'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { Search, Ban, CheckCircle, Wallet, ArrowRight, ArrowLeft, Trash2, AlertTriangle, BarChart2, KeyRound } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import ManagerAddBalanceDialog from './ManagerAddBalanceDialog'
import UserStatsDialog from '@/components/admin/users/UserStatsDialog'
import ResetPasswordDialog from '@/components/users/ResetPasswordDialog'
import { useTranslation } from '@/hooks/useTranslation'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface User {
    id: string
    username: string
    email: string
    role: string
    balance: number
    isActive: boolean
    createdAt: string
    points?: {
        available: number
        lifetimeEarned: number
        converted: number
        reversed: number
        legacy: number
    }
}

interface ManagerUsersTableProps {
    managerBalance: number
    onBalanceChange: () => void
}

export default function ManagerUsersTable({ managerBalance, onBalanceChange }: ManagerUsersTableProps) {
    const { t, language } = useTranslation()
    const [users, setUsers] = useState<User[]>([])
    const { load, loading, error, cancel } = usePanelRequest()
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [canResetPasswords, setCanResetPasswords] = useState(false)

    // Dialog States
    const [balanceUser, setBalanceUser] = useState<User | null>(null)
    const [statsUser, setStatsUser] = useState<User | null>(null)
    const [deleteUser, setDeleteUser] = useState<User | null>(null)
    const [resetUser, setResetUser] = useState<User | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)

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

    const fetchUsers = useCallback(async () => {
        const params = new URLSearchParams({ page: String(page), limit: '10', search: debouncedSearch })
        await load<{ users: User[]; totalPages: number; capabilities?: { canResetPasswords?: boolean } }>(`/api/manager/users?${params}`, data => {
            setUsers(data.users)
            const pages = Math.max(1, data.totalPages)
            setTotalPages(pages)
            if (page > pages) setPage(pages)
            setCanResetPasswords(Boolean(data.capabilities?.canResetPasswords))
        })
    }, [page, debouncedSearch, load])

    useEffect(() => { void fetchUsers(); return cancel }, [fetchUsers, cancel])

    const handleToggleStatus = async (user: User) => {
        const action = user.isActive ? (t.admin?.users?.actions?.disable || 'Disable') : (t.admin?.users?.actions?.enable || 'Enable')
        const confirmMsg = user.isActive ? t.admin?.users?.actions?.disableConfirm : t.admin?.users?.actions?.enableConfirm
        if (!confirm(confirmMsg || `Are you sure you want to ${action.toLowerCase()} "${user.username}"?`)) return

        try {
            const res = await fetch(`/api/manager/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !user.isActive }),
            })
            if (res.ok) fetchUsers()
            else {
                const data = await res.json()
                alert(data.error || t.admin?.users?.messages?.error || 'Failed to update status')
            }
        } catch {
        }
    }

    const handleDeleteUser = async () => {
        if (!deleteUser) return
        
        setDeleteLoading(true)
        setDeleteError(null)

        try {
            const res = await fetch(`/api/manager/users/${deleteUser.id}`, {
                method: 'DELETE',
            })
            const data = await res.json()
            if (res.ok) {
                fetchUsers()
                onBalanceChange() // Refresh manager balance
                setDeleteUser(null)
                alert(data.message || t.admin?.users?.messages?.deleteSuccess || 'User deleted successfully')
            } else {
                setDeleteError(data.error || t.admin?.users?.messages?.deleteFailed || 'Failed to delete user')
            }
        } catch {
            setDeleteError(t.admin?.users?.messages?.deleteError || 'An error occurred while deleting user')
        } finally {
            setDeleteLoading(false)
        }
    }

    const handleBalanceSuccess = () => {
        fetchUsers()
        onBalanceChange() // Refresh manager balance
    }

    return (
        <div className="space-y-4">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                    <input
                        type="text"
                        placeholder={t.admin?.users?.actions?.searchPlaceholder || 'Search by username or email...'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground"
                    />
                </div>
                <div className="text-sm text-muted-foreground self-center">
                    {t.manager?.users?.yourBalance || 'Your Balance'}: <span className="font-bold text-foreground">${managerBalance.toFixed(2)}</span>
                </div>
            </div>

            {error !== null && <PanelLoadError status={error} retry={fetchUsers} />}
            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border" hidden={error !== null}>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full">
                        <TableHeader className="bg-secondary border-b border-border">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin?.users?.table?.user || 'User'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin?.users?.table?.balance || 'Balance'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin?.users?.table?.status || 'Status'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.admin?.users?.table?.created || 'Created At'}</TableHead>
                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground pl-6">{t.admin?.users?.table?.actions || 'Actions'}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i} className="animate-pulse">
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-24"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-16"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-6 bg-muted rounded-full w-12"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-24"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-8 bg-muted rounded w-8"></div></TableCell>
                                    </TableRow>
                                ))
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">{t.admin?.users?.table?.noUsers || 'No users found'}</TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id} className="hover:bg-secondary transition-colors group">
                                        <TableCell className="px-4 py-3">
                                            <div>
                                                <p className="font-semibold text-foreground">{user.username}</p>
                                                <p className="text-xs text-muted-foreground dir-ltr text-right">{user.email}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <p className="font-bold text-foreground dir-ltr text-right">${(user.balance ?? 0).toFixed(2)}</p>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                <p className="font-semibold text-foreground">{(user.points?.available ?? 0).toLocaleString()} pts</p>
                                                <p>{(user.points?.lifetimeEarned ?? 0).toLocaleString()} earned / {(user.points?.converted ?? 0).toLocaleString()} converted</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.isActive
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                }`}>
                                                {user.isActive ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                                                {user.isActive ? (t.admin?.users?.table?.active || 'Active') : (t.admin?.users?.table?.inactive || 'Inactive')}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                            {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: currentLocale })}
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <div className="flex items-center gap-2 justify-end">
                                                {canResetPasswords && user.isActive && (
                                                    <button
                                                        onClick={() => setResetUser(user)}
                                                        className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 rounded-lg transition-colors"
                                                        aria-label={t.passwordReset.action}
                                                        title={t.passwordReset.action}
                                                    >
                                                        <KeyRound className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setStatsUser(user)}
                                                    className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 rounded-lg transition-colors"
                                                    title={t.admin?.users?.actions?.viewStats || 'User Statistics'}
                                                >
                                                    <BarChart2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setBalanceUser(user)}
                                                    className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded-lg transition-colors"
                                                    title={t.admin?.users?.actions?.addBalance || 'Manage Balance'}
                                                >
                                                    <Wallet className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleStatus(user)}
                                                    className={`p-1.5 rounded-lg transition-colors ${user.isActive
                                                        ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600'
                                                        : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600'
                                                        }`}
                                                    title={user.isActive ? (t.admin?.users?.actions?.disable || 'Disable') : (t.admin?.users?.actions?.enable || 'Enable')}
                                                >
                                                    {user.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => setDeleteUser(user)}
                                                    className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 rounded-lg transition-colors"
                                                    title={t.manager?.users?.actions?.delete || 'Delete User'}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
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
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                            {t.admin?.logs?.pagination?.page || 'Page'} {page} {t.admin?.logs?.pagination?.of || 'of'} {totalPages}
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

            {/* Dialogs */}
            <ManagerAddBalanceDialog
                isOpen={!!balanceUser}
                onClose={() => setBalanceUser(null)}
                onSuccess={handleBalanceSuccess}
                userId={balanceUser?.id || null}
                username={balanceUser?.username || null}
                managerBalance={managerBalance}
            />
            <UserStatsDialog
                isOpen={!!statsUser}
                onClose={() => setStatsUser(null)}
                userId={statsUser?.id || null}
                username={statsUser?.username || null}
                statsEndpoint={statsUser ? `/api/manager/users/${statsUser.id}/stats` : null}
                canCorrectBalance={false}
            />
            <ResetPasswordDialog
                isOpen={!!resetUser}
                onClose={() => setResetUser(null)}
                scope="manager"
                user={resetUser}
            />
            
            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            {t.manager?.deletedUsers?.deleteConfirmUser || 'Confirm Delete User'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                            <p>
                                {t.manager?.deletedUsers?.deleteConfirmUser || 'Are you sure you want to delete user'} <span className="font-bold text-foreground">{deleteUser?.username}</span>?
                            </p>
                            {deleteUser && deleteUser.balance > 0 && (
                                <p className="text-green-600 dark:text-green-400 font-medium">
                                    {t.manager?.deletedUsers?.balanceRefund || 'Balance of'} ${deleteUser.balance.toFixed(2)} {t.manager?.deletedUsers?.willBeRefunded || 'will be refunded to your account'}
                                </p>
                            )}
                            {deleteError && (
                                <p className="text-red-600 dark:text-red-400 text-sm">{deleteError}</p>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteLoading}>{t.common?.cancel || 'Cancel'}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault() // Prevent auto-close
                                handleDeleteUser()
                            }}
                            disabled={deleteLoading}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {deleteLoading ? (t.manager?.users?.deleting || 'Deleting...') : (t.manager?.users?.actions?.delete || 'Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
