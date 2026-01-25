'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowRight, ArrowLeft, User, Calendar, Wallet, BarChart2 } from 'lucide-react'
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
    const { t, language } = useTranslation()
    const [users, setUsers] = useState<DeletedUser[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }

    const currentLocale = localeMap[language as keyof typeof localeMap] || enUS

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/users/deleted?page=${page}&limit=10`)
            const data = await res.json()
            if (res.ok) {
                setUsers(data.users)
                setTotalPages(data.totalPages)
            }
        } catch (error) {
            console.error('Failed to fetch deleted users', error)
        } finally {
            setLoading(false)
        }
    }, [page])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const getRoleBadge = (role: string) => {
        const badges: Record<string, string> = {
            ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            MANAGER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            USER: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
        }
        return badges[role] || badges.USER
    }

    return (
        <div className="space-y-4">
            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-secondary border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.table?.user || 'User'}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.profile?.role || 'Role'}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.balanceAtDeletion || 'Balance at Deletion'}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.common?.operations || 'Operations'}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.table?.deletedAt || 'Deleted At'}</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.manager?.deletedUsers?.table?.deletedBy || 'Deleted By'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-16"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-20"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-16"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-20"></div></td>
                                    </tr>
                                ))
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">{t.manager?.deletedUsers?.noDeletedUsers || 'No deleted accounts'}</td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-secondary transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                                    <User className="w-4 h-4 text-red-600 dark:text-red-400" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-foreground">{user.username}</p>
                                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getRoleBadge(user.role)}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                <Wallet className="w-4 h-4" />
                                                <span className="font-bold">{(user.deletedBalance ?? 0).toLocaleString()} {t.header?.currency || 'USD'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <BarChart2 className="w-3 h-3" />
                                                <span>{user.operationCount} {t.admin?.users?.table?.operation || 'ops'}, {user.transactionCount} {t.admin?.users?.table?.transaction || 'txns'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(user.deletedAt), 'dd/MM/yyyy HH:mm', { locale: currentLocale })}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {user.deletedByUsername || t.common?.unknown || 'Unknown'}
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
                            {t.pagination?.page || 'Page'} {page} {t.pagination?.of || 'of'} {totalPages}
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
        </div>
    )
}
