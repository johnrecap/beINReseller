'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, FileX, XCircle, Loader2 } from 'lucide-react'
import { OPERATION_TYPE_LABELS, OPERATION_STATUS_LABELS } from '@/lib/constants'
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
    PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    PROCESSING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    AWAITING_CAPTCHA: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    COMPLETED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    CANCELLED: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

const typeColors: Record<string, string> = {
    RENEW: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
    CHECK_BALANCE: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    SIGNAL_REFRESH: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
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

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const handleCancel = async (operation: Operation) => {
        const confirmed = window.confirm(
            t.history.confirmCancel // Note: Ideally, include amount here using string interpolation if supported by implementation, or simple text for now
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
            <div className="bg-card rounded-xl shadow-sm p-12 text-center">
                <FileX className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">{t.history.noOperations}</h3>
                <p className="text-muted-foreground text-sm">{t.history.noMatchingOperations}</p>
            </div>
        )
    }

    return (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-secondary border-b border-border">
                        <tr>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">#</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.history.type}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.history.cardNumber}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.history.amount}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.history.status}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.history.result}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.history.date}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.history.actions}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {operations.map((op, index) => (
                            <tr key={op.id} className="hover:bg-secondary transition-colors">
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                    {(page - 1) * 10 + index + 1}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${typeColors[op.type] || 'bg-gray-100 dark:bg-gray-800'}`}>
                                        {(t.operations as Record<string, string>)[op.type === 'CHECK_BALANCE' ? 'checkBalance' : op.type === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || op.type}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-sm text-foreground">
                                    ****{op.cardNumber.slice(-4)}
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-foreground">
                                    {op.amount} {t.header.currency}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColors[op.status] || 'bg-gray-100 dark:bg-gray-800'}`}>
                                        {(t.status as Record<string, string>)?.[op.status === 'AWAITING_CAPTCHA' ? 'awaitingCaptcha' : (typeof op.status === 'string' ? op.status.toLowerCase() : 'pending')] ?? op.status ?? 'Unknown'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                                    {op.responseMessage || '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                    {format(new Date(op.createdAt), 'dd/MM/yyyy HH:mm', { locale: getDateLocale() })}
                                </td>
                                <td className="px-4 py-3">
                                    {CANCELLABLE_STATUSES.includes(op.status) ? (
                                        <button
                                            onClick={() => handleCancel(op)}
                                            disabled={cancellingId === op.id}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {cancellingId === op.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <XCircle className="w-3.5 h-3.5" />
                                            )}
                                            <span>{t.history.cancelOperation}</span>
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                        {language === 'en' ? `Page ${page} of ${totalPages}` : `${t.common.noData.replace('No Data', '')} ${page} / ${totalPages}`}
                        {page} / {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            title={t.common.back}
                            className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            title={t.common.confirm} // Using confirm as forward? no. Need next/prev keys. using back for prev. for next I can use chevron.
                            className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
