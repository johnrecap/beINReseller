'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { Wallet } from 'lucide-react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { PanelTablePagination, SortableTableHead } from '@/components/ui/PanelTableControls'
import { useTranslation } from '@/hooks/useTranslation'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import TransactionStats from './TransactionStats'

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
    DEPOSIT: 'bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/30',
    WITHDRAW: 'bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/30',
    REFUND: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30',
    OPERATION_DEDUCT: 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30',
    CORRECTION: 'bg-gray-500/10 text-gray-500 border border-gray-500/30',
}

export default function TransactionsTable() {
    const { t, language } = useTranslation()

    const getTypeLabel = (type: string): string => {
        const labels: Record<string, string> = {
            DEPOSIT: t.transactions?.typeDeposit || 'Deposit',
            WITHDRAW: t.transactions?.typeWithdraw || 'Withdraw',
            REFUND: t.transactions?.typeRefund || 'Refund',
            OPERATION_DEDUCT: t.transactions?.typeOperation || 'Operation',
            CORRECTION: t.transactions?.typeCorrection || 'Correction',
        }
        return labels[type] || type
    }

    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [stats, setStats] = useState({ totalDeposits: 0, totalDeductions: 0, currentBalance: 0 })
    const { load, loading, error, cancel } = usePanelRequest()
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [sortConfig, setSortConfig] = useState<{ key: 'amount' | 'balanceAfter' | 'date', direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' })

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const handleSort = (key: 'amount' | 'balanceAfter' | 'date') => {
        setPage(1)
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }))
    }

    const sortedTransactions = transactions

    const fetchTransactions = useCallback(async () => {
        const params = new URLSearchParams({ page: String(page), limit: '10',
            sortBy: sortConfig.key === 'date' ? 'createdAt' : sortConfig.key, sortOrder: sortConfig.direction })
        await load<{ transactions: Transaction[]; totalPages: number; total: number; stats: typeof stats }>(`/api/transactions?${params}`, data => {
            setTransactions(data.transactions)
            setTotal(data.total)
            setStats(data.stats)
            if (page > Math.max(1, data.totalPages)) setPage(Math.max(1, data.totalPages))
        })
    }, [page, sortConfig, load])

    useEffect(() => {
        void fetchTransactions()
        return cancel
    }, [fetchTransactions, cancel])

    if (error !== null) return <PanelLoadError status={error} retry={fetchTransactions} />

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-32 bg-card rounded-2xl animate-pulse"></div>
                    ))}
                </div>
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                    <div className="animate-pulse">
                        <div className="h-14 bg-muted"></div>
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-16 bg-secondary border-t border-border"></div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (transactions.length === 0) {
        return (
            <div className="space-y-6">
                <TransactionStats stats={stats} />
                <div className="bg-card rounded-xl shadow-sm p-12 text-center animate-in zoom-in-95 duration-300">
                    <div className="w-20 h-20 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                        <Wallet className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">{t.transactions.noTransactions}</h3>
                    <p className="text-muted-foreground text-sm">{t.transactions.noMatchingTransactions}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="animate-in fade-in duration-500">
            <TransactionStats stats={stats} />

            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <Table panel className="w-full">
                        <TableHeader className="bg-[#1a1d26]/50 border-b border-border">
                            <TableRow>
                                <TableHead className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[60px]">#</TableHead>
                                <TableHead className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[150px]">{t.transactions.type}</TableHead>
                                <SortableTableHead
                                    className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px] cursor-pointer hover:text-foreground transition-colors group" onSort={() => handleSort('amount')} direction={sortConfig.key === 'amount' ? sortConfig.direction : undefined}>
                                    <div className="flex items-center justify-start gap-1">
                                        {t.transactions.amount}
                                        <span className={`transition-opacity ${sortConfig.key === 'amount' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                        </span>
                                    </div>
                                </SortableTableHead>
                                <SortableTableHead
                                    className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px] cursor-pointer hover:text-foreground transition-colors group" onSort={() => handleSort('balanceAfter')} direction={sortConfig.key === 'balanceAfter' ? sortConfig.direction : undefined}>
                                    <div className="flex items-center justify-start gap-1">
                                        {t.transactions.balanceAfter}
                                        <span className={`transition-opacity ${sortConfig.key === 'balanceAfter' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                        </span>
                                    </div>
                                </SortableTableHead>
                                <TableHead className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[250px]">{t.transactions.notes}</TableHead>
                                <SortableTableHead
                                    className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px] cursor-pointer hover:text-foreground transition-colors group" onSort={() => handleSort('date')} direction={sortConfig.key === 'date' ? sortConfig.direction : undefined}>
                                    <div className="flex items-center justify-start gap-1">
                                        {t.transactions.date}
                                        <span className={`transition-opacity ${sortConfig.key === 'date' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                        </span>
                                    </div>
                                </SortableTableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {sortedTransactions.map((tx, index) => (
                                <TableRow
                                    key={tx.id}
                                    className="hover:bg-muted/30 transition-colors animate-in fade-in fill-mode-both"
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <TableCell className="px-6 py-4 text-sm text-muted-foreground text-center font-medium">
                                        {(page - 1) * 10 + index + 1}
                                    </TableCell>
                                    <TableCell className="px-6 py-4">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${typeColors[tx.type] || 'bg-gray-100 dark:bg-gray-800'} transition-transform hover:scale-105`}>
                                            {getTypeLabel(tx.type)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-base font-bold dir-ltr text-start">
                                        <span className={tx.amount > 0 ? 'text-[#00A651]' : tx.amount < 0 ? 'text-[#ED1C24]' : 'text-muted-foreground'}>
                                            {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} {t.transactions?.currency}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-base font-mono text-foreground dir-ltr text-start">
                                        {tx.balanceAfter.toFixed(2)} {t.transactions?.currency}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                        <div className="max-w-[250px] truncate" title={tx.notes || ''}>
                                            {tx.notes || '-'}
                                        </div>
                                        {tx.operationId && (
                                            <span className="block text-xs text-muted-foreground/70 font-mono mt-1">Op: #{tx.operationId.slice(-4)}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-muted-foreground dir-ltr text-start">
                                        {format(new Date(tx.createdAt), 'HH:mm dd/MM/yyyy', { locale: getDateLocale() })}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-border">
                    {sortedTransactions.map((tx, index) => (
                        <div
                            key={tx.id}
                            className="p-4 hover:bg-muted/10 transition-colors animate-in fade-in fill-mode-both"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${typeColors[tx.type] || 'bg-gray-100 dark:bg-gray-800'}`}>
                                    {getTypeLabel(tx.type)}
                                </span>
                                <span className="text-xs text-muted-foreground dir-ltr">
                                    {format(new Date(tx.createdAt), 'HH:mm dd/MM/yyyy', { locale: getDateLocale() })}
                                </span>
                            </div>

                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-muted-foreground">{t.transactions.amount}</span>
                                <span className={`text-lg font-bold ${tx.amount > 0 ? 'text-[#00A651]' : tx.amount < 0 ? 'text-[#ED1C24]' : 'text-muted-foreground'}`}>
                                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} USD
                                </span>
                            </div>

                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-muted-foreground">{t.transactions.balanceAfter}</span>
                                <span className="text-sm font-medium text-foreground">{tx.balanceAfter.toFixed(2)} USD</span>
                            </div>

                            {tx.notes && (
                                <div className="mt-3 pt-3 border-t border-border border-dashed text-xs text-muted-foreground">
                                    {tx.notes}
                                    {tx.operationId && (
                                        <span className="block mt-1 font-mono text-muted-foreground/70">Op: #{tx.operationId.slice(-4)}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

            <PanelTablePagination page={page} total={total} onPageChange={setPage} />
            </div>
        </div>
    )
}
