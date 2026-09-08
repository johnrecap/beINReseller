'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useState, useEffect, useCallback, useRef } from 'react'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { ArrowRight, ArrowLeft, User, Calendar, Wallet, BarChart2, RotateCcw, Trash2, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface DeletedUser {
    id: string
    username: string
    email: string
    role: string
    deletedBalance: number | null
    deletedAt: string
    deletedByUsername: string | null
    createdAt: string
    transactionCount: number
    operationCount: number
}

export default function DeletedUsersTable() {
    const { t, language, dir } = useTranslation()
    const [users, setUsers] = useState<DeletedUser[]>([])
    const { load, loading, error, cancel } = usePanelRequest()
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const actionPending = useRef(false)
    const [actionUserId, setActionUserId] = useState<string | null>(null)
    const [actionType, setActionType] = useState<'restore' | 'permanent' | null>(null)

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }

    const currentLocale = localeMap[language as keyof typeof localeMap] || enUS

    const fetchUsers = useCallback(() => {
        setUsers([])
        return load<{ users: DeletedUser[]; totalPages: number }>(`/api/admin/users/deleted?page=${page}&limit=10`, data => {
            const lastPage = Math.max(1, data.totalPages)
            setTotalPages(lastPage)
            if (page > lastPage) { setPage(lastPage); return }
            setUsers(data.users)
        })
    }, [page, load])

    useEffect(() => {
        const timer = window.setTimeout(() => void fetchUsers(), 0)
        return () => { window.clearTimeout(timer); cancel() }
    }, [fetchUsers, cancel])

    const handleRestore = async (user: DeletedUser) => {
        if (actionPending.current) return
        const confirmMessage = t.manager?.deletedUsers?.restoreConfirm || 'Are you sure you want to restore this account?'
        if (!confirm(confirmMessage)) return

        actionPending.current = true
        setActionUserId(user.id)
        setActionType('restore')
        try {
            const res = await fetch(`/api/admin/users/${user.id}/restore`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) {
                alert(data.error || t.manager?.messages?.error || 'Failed to restore user')
                return
            }
            alert(data.message || t.manager?.messages?.userRestored || 'User restored successfully')
            await fetchUsers()
        } catch {
            alert(t.manager?.messages?.error || 'An error occurred')
        } finally {
            actionPending.current = false
            setActionUserId(null)
            setActionType(null)
        }
    }

    const handlePermanentDelete = async (user: DeletedUser) => {
        if (actionPending.current) return
        const confirmMessage = t.manager?.deletedUsers?.deleteConfirm || 'Are you sure you want to permanently delete this account? This action cannot be undone.'
        if (!confirm(confirmMessage)) return

        actionPending.current = true
        setActionUserId(user.id)
        setActionType('permanent')
        try {
            const res = await fetch(`/api/admin/users/${user.id}/permanent`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) {
                alert(data.error || t.admin?.users?.messages?.deleteFailed || 'Failed to delete user')
                return
            }
            alert(data.message || t.admin?.users?.messages?.deleteSuccess || 'User permanently deleted')
            await fetchUsers()
        } catch {
            alert(t.admin?.users?.messages?.deleteError || 'An error occurred while deleting user')
        } finally {
            actionPending.current = false
            setActionUserId(null)
            setActionType(null)
        }
    }

    const getRoleBadge = (role: string) => {
        const badges: Record<string, string> = {
            ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            MANAGER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            AGENT: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
            USER: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
        }
        return badges[role] || badges.USER
    }

    return (
        <div className="space-y-4">
            {error !== null && <PanelLoadError status={error} retry={() => void fetchUsers()} />}
            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border" hidden={error !== null}>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full">
                        <TableHeader className="bg-secondary border-b border-border">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.table?.user || 'User'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.profile?.role || 'Role'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.balanceAtDeletion || 'Balance at Deletion'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.common?.operations || 'Operations'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.table?.deletedAt || 'Deleted At'}</TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.table?.deletedBy || 'Deleted By'}</TableHead>
                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.table?.actions || 'Actions'}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i} className="animate-pulse">
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-24"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-16"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-20"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-16"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-24"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-20"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-28"></div></TableCell>
                                    </TableRow>
                                ))
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">{t.manager?.deletedUsers?.noDeletedUsers || 'No deleted accounts'}</TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id} className="hover:bg-secondary transition-colors">
                                        <TableCell className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                                    <User className="w-4 h-4 text-red-600 dark:text-red-400" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-foreground">{user.username}</p>
                                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getRoleBadge(user.role)}`}>
                                                {user.role}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                <Wallet className="w-4 h-4" />
                                                <span className="font-bold">{(user.deletedBalance ?? 0).toLocaleString()} {t.header?.currency || 'USD'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <BarChart2 className="w-3 h-3" />
                                                <span>{user.operationCount} {t.admin?.users?.table?.operation || 'ops'}, {user.transactionCount} {t.admin?.users?.table?.transaction || 'txns'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(user.deletedAt), 'dd/MM/yyyy HH:mm', { locale: currentLocale })}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                            {user.deletedByUsername || t.common?.unknown || 'Unknown'}
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleRestore(user)}
                                                    disabled={actionUserId !== null}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-60 disabled:cursor-not-allowed text-xs"
                                                    title={t.manager?.deletedUsers?.actions?.restore || 'Restore'}
                                                >
                                                    {actionUserId === user.id && actionType === 'restore'
                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                        : <RotateCcw className="w-3 h-3" />
                                                    }
                                                    <span>{t.manager?.deletedUsers?.actions?.restore || 'Restore'}</span>
                                                </button>
                                                <button
                                                    onClick={() => handlePermanentDelete(user)}
                                                    disabled={actionUserId !== null}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed text-xs"
                                                    title={t.manager?.deletedUsers?.actions?.permanentDelete || 'Permanent Delete'}
                                                >
                                                    {actionUserId === user.id && actionType === 'permanent'
                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                        : <Trash2 className="w-3 h-3" />
                                                    }
                                                    <span>{t.manager?.deletedUsers?.actions?.permanentDelete || 'Permanent Delete'}</span>
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
                            {t.pagination?.page || 'Page'} {page} {t.pagination?.of || 'of'} {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                title={t.pagination?.previousPage || 'Previous Page'}
                            >
                                {dir === 'rtl' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                title={t.pagination?.nextPage || 'Next Page'}
                            >
                                {dir === 'rtl' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
