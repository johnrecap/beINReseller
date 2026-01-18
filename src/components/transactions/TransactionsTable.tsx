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

const typeColors: Record<string, string> = {
    DEPOSIT: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    WITHDRAW: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    REFUND: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    OPERATION_DEDUCT: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
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

    if (transactions.length === 0) {
        return (
            <div className="bg-card rounded-xl shadow-sm p-12 text-center">
                <FileX className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">{t.transactions.noTransactions}</h3>
                <p className="text-muted-foreground text-sm">{t.transactions.noMatchingTransactions}</p>
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
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.transactions.type}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.transactions.amount}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.transactions.balanceAfter}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.transactions.notes}</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{t.transactions.date}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {transactions.map((tx, index) => (
                            <tr key={tx.id} className="hover:bg-secondary transition-colors">
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                    {(page - 1) * 10 + index + 1}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${typeColors[tx.type] || 'bg-gray-100'}`}>
                                        {(t.transactions as Record<string, string>)[tx.type === 'DEPOSIT' ? 'deposit' : tx.type === 'WITHDRAW' ? 'withdrawal' : tx.type === 'OPERATION_DEDUCT' ? 'operationDeduction' : 'refund'] || tx.type}
                                    </span>
                                </td>
                                <td className={`px-4 py-3 text-sm font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'} dir-ltr text-right`}>
                                    {tx.amount > 0 ? '+' : ''}{tx.amount} {t.header.currency}
                                </td>
                                <td className="px-4 py-3 text-sm font-mono text-foreground">
                                    {tx.balanceAfter} {t.header.currency}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                                    {tx.notes || '-'}
                                    {tx.operationId && (
                                        <span className="block text-xs text-muted-foreground/70 font-mono mt-1">Op: #{tx.operationId.slice(-4)}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                    {format(new Date(tx.createdAt), 'dd/MM/yyyy HH:mm', { locale: getDateLocale() })}
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
                        {t.pagination?.page || 'Page'} {page} {t.pagination?.of || 'of'} {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            title={t.pagination?.previous || 'Previous'}
                            className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            title={t.pagination?.next || 'Next'}
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
