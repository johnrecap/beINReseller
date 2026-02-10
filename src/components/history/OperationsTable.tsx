'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, FileX, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/useTranslation'

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage?: string
    createdAt: string
}

interface OperationsTableProps {
    operations: Operation[]
    loading?: boolean
    page: number
    totalPages: number
    onPageChange: (page: number) => void
    onRefresh?: () => void
}

const statusColors: Record<string, string> = {
    PENDING: 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30',
    PROCESSING: 'bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/30',
    AWAITING_CAPTCHA: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30',
    COMPLETED: 'bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/30',
    FAILED: 'bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/30',
    CANCELLED: 'bg-gray-500/10 text-gray-500 border border-gray-500/30',
}

const typeColors: Record<string, string> = {
    RENEW: 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30',
    CHECK_BALANCE: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30',
    SIGNAL_REFRESH: 'bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/30',
}

// Statuses that can be cancelled (FAILED is excluded - auto-refunded by worker)
const CANCELLABLE_STATUSES = ['PENDING', 'AWAITING_CAPTCHA']

export default function OperationsTable({
    operations,
    loading,
    page,
    totalPages,
    onPageChange,
    onRefresh,
}: OperationsTableProps) {
    const { t, language } = useTranslation()
    const [cancellingId, setCancellingId] = useState<string | null>(null)
    const [sortConfig, setSortConfig] = useState<{ key: keyof Operation | 'date', direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' })

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const handleSort = (key: keyof Operation | 'date') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }))
    }

    const sortedOperations = [...operations].sort((a, b) => {
        const { key, direction } = sortConfig
        let aValue: string | number | undefined
        let bValue: string | number | undefined

        if (key === 'date') {
            aValue = new Date(a.createdAt).getTime()
            bValue = new Date(b.createdAt).getTime()
        } else {
            aValue = a[key as keyof Operation] as string | number | undefined
            bValue = b[key as keyof Operation] as string | number | undefined
        }

        if (aValue === undefined || bValue === undefined) return 0
        if (aValue < bValue) return direction === 'asc' ? -1 : 1
        if (aValue > bValue) return direction === 'asc' ? 1 : -1
        return 0
    })

    const handleCancel = async (operation: Operation) => {
        const confirmed = window.confirm(
            t.history.confirmCancel
        )
        if (!confirmed) return

        setCancellingId(operation.id)
        try {
            const res = await fetch(`/api/operations/${operation.id}/cancel`, {
                method: 'POST',
            })
            const data = await res.json()

            if (res.ok) {
                toast.success(t.history.refundMessage)
                onRefresh?.()
            } else {
                toast.error(data.error || t.common.error)
            }
        } catch {
            toast.error(t.common.error)
        } finally {
            setCancellingId(null)
        }
    }

    if (loading) {
        return (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                <div className="animate-pulse">
                    <div className="h-12 bg-muted"></div>
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 bg-secondary border-t border-border"></div>
                    ))}
                </div>
            </div>
        )
    }

    if (operations.length === 0) {
        return (
            <div className="bg-card rounded-xl shadow-sm p-12 text-center animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                    <FileX className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{t.history.noOperations}</h3>
                <p className="text-muted-foreground text-sm mb-6">{t.history.noMatchingOperations}</p>
                {onRefresh && (
                    <button
                        onClick={() => onRefresh()}
                        className="px-4 py-2 bg-secondary hover:bg-muted text-foreground rounded-lg text-sm font-medium transition-colors border border-border"
                    >
                        {t.common.reset}
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-500">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-[#1a1d26]/50 border-b border-border">
                        <tr>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[60px]">#</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px]">{t.history.type}</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">{t.history.cardNumber}</th>
                            <th
                                className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px] cursor-pointer hover:text-foreground transition-colors group"
                                onClick={() => handleSort('amount')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    {t.history.amount}
                                    <span className={`transition-opacity ${sortConfig.key === 'amount' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                    </span>
                                </div>
                            </th>
                            <th
                                className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px] cursor-pointer hover:text-foreground transition-colors group"
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    {t.history.status}
                                    <span className={`transition-opacity ${sortConfig.key === 'status' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                    </span>
                                </div>
                            </th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[250px]">{t.history.result}</th>
                            <th
                                className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px] cursor-pointer hover:text-foreground transition-colors group"
                                onClick={() => handleSort('date')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    {t.history.date}
                                    <span className={`transition-opacity ${sortConfig.key === 'date' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                    </span>
                                </div>
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[80px]">{t.history.actions}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {sortedOperations.map((op, index) => (
                            <tr
                                key={op.id}
                                className="hover:bg-muted/30 transition-colors animate-in fade-in fill-mode-both"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <td className="px-6 py-4 text-sm text-muted-foreground text-center font-medium">
                                    {(page - 1) * 10 + index + 1}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${typeColors[op.type] || 'bg-gray-100 dark:bg-gray-800'} transition-transform hover:scale-105`}>
                                        {(t.operations as Record<string, string>)[op.type === 'CHECK_BALANCE' ? 'checkBalance' : op.type === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || op.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono text-sm text-foreground">
                                    <span className="bg-muted px-2 py-1 rounded text-xs tracking-wider">
                                        {op.cardNumber}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-foreground dir-ltr text-right">
                                    {op.amount > 0 ? (
                                        <span className="text-white">{op.amount.toFixed(2)} دولار</span>
                                    ) : (
                                        <span className="text-muted-foreground">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColors[op.status] || 'bg-gray-100 dark:bg-gray-800'} transition-transform hover:scale-105`}>
                                        {(t.status as Record<string, string>)?.[op.status === 'AWAITING_CAPTCHA' ? 'awaitingCaptcha' : (typeof op.status === 'string' ? op.status.toLowerCase() : 'pending')] ?? op.status ?? 'Unknown'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-muted-foreground">
                                    <div className="max-w-[250px] truncate" title={op.responseMessage || ''}>
                                        {op.responseMessage || '-'}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-muted-foreground dir-ltr text-right">
                                    {format(new Date(op.createdAt), 'HH:mm dd/MM/yyyy', { locale: getDateLocale() })}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {CANCELLABLE_STATUSES.includes(op.status) ? (
                                        <button
                                            onClick={() => handleCancel(op)}
                                            disabled={cancellingId === op.id}
                                            className="inline-flex items-center justify-center p-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
                                            title={t.history.cancelOperation}
                                        >
                                            {cancellingId === op.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <XCircle className="w-4 h-4" />
                                            )}
                                        </button>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile List View */}
            <div className="md:hidden divide-y divide-border">
                {sortedOperations.map((op, index) => (
                    <div
                        key={op.id}
                        className="p-4 hover:bg-muted/10 transition-colors animate-in fade-in fill-mode-both"
                        style={{ animationDelay: `${index * 50}ms` }}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-col">
                                <span className="font-mono text-sm font-medium text-foreground bg-muted/50 px-2 py-0.5 rounded w-fit mb-1">
                                    {op.cardNumber}
                                </span>
                                <span className="text-xs text-muted-foreground dir-ltr text-right w-fit">
                                    {format(new Date(op.createdAt), 'HH:mm dd/MM/yyyy', { locale: getDateLocale() })}
                                </span>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${typeColors[op.type] || 'bg-gray-100 dark:bg-gray-800'}`}>
                                    {(t.operations as Record<string, string>)[op.type === 'CHECK_BALANCE' ? 'checkBalance' : op.type === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || op.type}
                                </span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusColors[op.status] || 'bg-gray-100 dark:bg-gray-800'}`}>
                                    {(t.status as Record<string, string>)?.[op.status === 'AWAITING_CAPTCHA' ? 'awaitingCaptcha' : (typeof op.status === 'string' ? op.status.toLowerCase() : 'pending')] ?? op.status ?? 'Unknown'}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-between items-end mt-4">
                            <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground mb-1">{t.history.amount}:</span>
                                {op.amount > 0 ? (
                                    <span className="text-lg font-bold text-[#00A651]">{op.amount.toFixed(2)} USD</span>
                                ) : (
                                    <span className="text-sm font-medium text-muted-foreground">-</span>
                                )}
                            </div>

                            {CANCELLABLE_STATUSES.includes(op.status) && (
                                <button
                                    onClick={() => handleCancel(op)}
                                    disabled={cancellingId === op.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg"
                                >
                                    {cancellingId === op.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <XCircle className="w-3.5 h-3.5" />
                                    )}
                                    {t.history.cancelOperation}
                                </button>
                            )}
                        </div>

                        {op.responseMessage && (
                            <div className="mt-3 pt-3 border-t border-border border-dashed text-xs text-muted-foreground">
                                {op.responseMessage}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
                    <p className="text-sm text-muted-foreground hidden sm:block">
                        {t.pagination?.page || 'عرض'} {(page - 1) * 10 + 1}-{Math.min(page * 10, operations.length + (page - 1) * 10)} {t.pagination?.of || 'من'} {totalPages * 10}
                    </p>
                    <div className="flex gap-2 w-full sm:w-auto justify-between sm:justify-start">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            aria-label="الصفحة السابقة"
                            className="p-2 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1 px-2">
                            <span className="text-sm font-medium">{page}</span>
                            <span className="text-sm text-muted-foreground">/ {totalPages}</span>
                        </div>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            aria-label="الصفحة التالية"
                            className="p-2 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
