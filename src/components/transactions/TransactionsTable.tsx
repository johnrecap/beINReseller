'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, FileX } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface Transaction {
    id: string
    type: string
    amount: number
    balanceAfter: number
    notes?: string
    createdAt: string
    operationId?: string
}

const typeLabels: Record<string, string> = {
    DEPOSIT: 'shahnRaseed', // Placeholder for key
    WITHDRAW: 'withdrawRaseed',
    REFUND: 'istirdad',
    OPERATION_DEDUCT: 'operationDeduct',
}

const typeColors: Record<string, string> = {
    DEPOSIT: 'bg-green-100 text-green-700',
    WITHDRAW: 'bg-red-100 text-red-700',
    REFUND: 'bg-yellow-100 text-yellow-700',
    OPERATION_DEDUCT: 'bg-blue-100 text-blue-700',
}

export default function TransactionsTable() {
    const { t, language } = useTranslation()
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const fetchTransactions = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/transactions?page=${page}&limit=10`)
            const data = await res.json()

            if (res.ok) {
                setTransactions(data.transactions)
                setTotalPages(data.totalPages)
            }
        } catch (error) {
            console.error('Failed to fetch transactions:', error)
        } finally {
            setLoading(false)
        }
    }, [page])

    useEffect(() => {
        fetchTransactions()
    }, [fetchTransactions])

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

    if (transactions.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                <FileX className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-600 mb-2">{t.transactions.noTransactions}</h3>
                <p className="text-gray-400 text-sm">{t.transactions.noMatchingTransactions}</p>
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
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.transactions.type}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.transactions.amount}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.transactions.balanceAfter}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.transactions.notes}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.transactions.date}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {transactions.map((tx, index) => (
                            <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-500">
                                    {(page - 1) * 10 + index + 1}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${typeColors[tx.type] || 'bg-gray-100'}`}>
                                        {(t.transactions as any)[tx.type === 'DEPOSIT' ? 'deposit' : tx.type === 'WITHDRAW' ? 'withdrawal' : tx.type === 'OPERATION_DEDUCT' ? 'operationDeduction' : 'refund'] || tx.type}
                                    </span>
                                </td>
                                <td className={`px-4 py-3 text-sm font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'} dir-ltr text-right`}>
                                    {tx.amount > 0 ? '+' : ''}{tx.amount} {t.header.currency}
                                </td>
                                <td className="px-4 py-3 text-sm font-mono text-gray-700">
                                    {tx.balanceAfter} {t.header.currency}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
                                    {tx.notes || '-'}
                                    {tx.operationId && (
                                        <span className="block text-xs text-gray-400 font-mono mt-1">Op: #{tx.operationId.slice(-4)}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                    {format(new Date(tx.createdAt), 'dd/MM/yyyy HH:mm', { locale: getDateLocale() })}
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
                        {page} / {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
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
