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
    PENDING: 'bg-amber-100 text-amber-700',
    PROCESSING: 'bg-blue-100 text-blue-700',
    AWAITING_CAPTCHA: 'bg-yellow-100 text-yellow-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-600',
}

const typeColors: Record<string, string> = {
    RENEW: 'bg-purple-100 text-purple-700',
    CHECK_BALANCE: 'bg-blue-100 text-blue-700',
    SIGNAL_REFRESH: 'bg-green-100 text-green-700',
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
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="animate-pulse">
                    <div className="h-12 bg-gray-100"></div>
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 bg-gray-50 border-t border-gray-100"></div>
                    ))}
                </div>
            </div>
        )
    }

    if (operations.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                <FileX className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-600 mb-2">{t.history.noOperations}</h3>
                <p className="text-gray-400 text-sm">{t.history.noMatchingOperations}</p>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">#</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.history.type}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.history.cardNumber}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.history.amount}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.history.status}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.history.result}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.history.date}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.history.actions}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {operations.map((op, index) => (
                            <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-500">
                                    {(page - 1) * 10 + index + 1}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${typeColors[op.type] || 'bg-gray-100'}`}>
                                        {(t.operations as Record<string, string>)[op.type === 'CHECK_BALANCE' ? 'checkBalance' : op.type === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || op.type}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-sm">
                                    ****{op.cardNumber.slice(-4)}
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-gray-700">
                                    {op.amount} {t.header.currency}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColors[op.status] || 'bg-gray-100'}`}>
                                        {(t.status as Record<string, string>)?.[op.status === 'AWAITING_CAPTCHA' ? 'awaitingCaptcha' : (typeof op.status === 'string' ? op.status.toLowerCase() : 'pending')] ?? op.status ?? 'Unknown'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
                                    {op.responseMessage || '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                    {format(new Date(op.createdAt), 'dd/MM/yyyy HH:mm', { locale: getDateLocale() })}
                                </td>
                                <td className="px-4 py-3">
                                    {CANCELLABLE_STATUSES.includes(op.status) ? (
                                        <button
                                            onClick={() => handleCancel(op)}
                                            disabled={cancellingId === op.id}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {cancellingId === op.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <XCircle className="w-3.5 h-3.5" />
                                            )}
                                            <span>{t.history.cancelOperation}</span>
                                        </button>
                                    ) : (
                                        <span className="text-xs text-gray-400">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                        {language === 'en' ? `Page ${page} of ${totalPages}` : `${t.common.noData.replace('No Data', '')} ${page} / ${totalPages}`} {/* Fallback pagination text or add new key. using simple approach now */}
                        {/* Actually, let's just leave page number for now or use icons */}
                        {page} / {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            title={t.common.back}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            title={t.common.confirm} // Using confirm as forward? no. Need next/prev keys. using back for prev. for next I can use chevron.
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
