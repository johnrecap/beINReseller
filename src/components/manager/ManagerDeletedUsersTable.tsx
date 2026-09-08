'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useState, useEffect, useCallback } from 'react'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
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
    createdAt: string
    transactionCount: number
    operationCount: number
}

export default function ManagerDeletedUsersTable() {
    const { t, language, dir } = useTranslation()
    const [users, setUsers] = useState<DeletedUser[]>([])
    const { load, loading, error, cancel } = usePanelRequest()
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }
    const currentLocale = localeMap[language as keyof typeof localeMap] || enUS
    const textAlign = dir === 'rtl' ? 'text-right' : 'text-left'

    const fetchUsers = useCallback(() => {
        setUsers([])
        return load<{ users: DeletedUser[]; totalPages: number }>(`/api/manager/users/deleted?page=${page}&limit=10`, data => {
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

    return (
        <div className="space-y-4">
            {error !== null && <PanelLoadError status={error} retry={() => void fetchUsers()} />}
            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border" hidden={error !== null}>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full">
                        <TableHeader className="bg-secondary border-b border-border">
                            <TableRow>
                                <TableHead className={`px-4 py-3 ${textAlign} text-xs font-medium text-muted-foreground`}>{t.manager?.users?.table?.user || 'User'}</TableHead>
                                <TableHead className={`px-4 py-3 ${textAlign} text-xs font-medium text-muted-foreground`}>{t.manager?.deletedUsers?.balanceAtDeletion || 'Balance at Deletion'}</TableHead>
                                <TableHead className={`px-4 py-3 ${textAlign} text-xs font-medium text-muted-foreground`}>{t.common?.operations || 'Operations'}</TableHead>
                                <TableHead className={`px-4 py-3 ${textAlign} text-xs font-medium text-muted-foreground`}>{t.manager?.deletedUsers?.table?.deletedAt || 'Deleted At'}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i} className="animate-pulse">
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-24"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-20"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-16"></div></TableCell>
                                        <TableCell className="p-4"><div className="h-4 bg-muted rounded w-24"></div></TableCell>
                                    </TableRow>
                                ))
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="p-8 text-center text-muted-foreground">{t.manager?.deletedUsers?.noDeletedUsers || 'No deleted accounts'}</TableCell>
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
                                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                <Wallet className="w-4 h-4" />
                                                <span className="font-bold">${(user.deletedBalance ?? 0).toLocaleString()}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <BarChart2 className="w-3 h-3" />
                                                <span>{user.operationCount} {t.common?.operations || 'operations'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(user.deletedAt), 'dd/MM/yyyy HH:mm', { locale: currentLocale })}
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
                                title={t.pagination?.previousPage || 'Previous page'}
                            >
                                {dir === 'rtl' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                title={t.pagination?.nextPage || 'Next page'}
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
