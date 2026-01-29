'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Loader2, DollarSign, ArrowUpCircle, ArrowDownCircle, Wallet, ChevronDown, CheckCircle, Wrench } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface UserStatsDialogProps {
    isOpen: boolean
    onClose: () => void
    userId: string | null
    username: string | null
}

interface Transaction {
    id: string
    type: string
    amount: number
    balanceAfter: number
    notes: string | null
    createdAt: string
    operationId: string | null
}

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage: string | null
    createdAt: string
    completedAt: string | null
}

interface StatsData {
    user: {
        id: string
        username: string
        email: string
        isActive: boolean
        createdAt: string
    }
    financials: {
        totalDeposits: number
        totalDeductions: number
        totalRefunds: number
        totalWithdrawals: number
        totalCorrections: number
        expectedBalance: number
        actualBalance: number
        discrepancy: number
        isBalanceValid: boolean
    }
    operations: {
        total: number
        completed: number
        failed: number
        cancelled: number
        pending: number
        processing: number
    }
    alerts: {
        type: string
        message: string
        severity: 'high' | 'medium' | 'low'
        operationId?: string
    }[]
    recentTransactions: Transaction[]
    recentOperations: Operation[]
    pagination: {
        transactions: { total: number; limit: number; skip: number; hasMore: boolean }
        operations: { total: number; limit: number; skip: number; hasMore: boolean }
    }
}

const getTransactionTypeLabels = (t: ReturnType<typeof useTranslation>['t']) => ({
    DEPOSIT: { label: t.userStats?.deposit || 'Deposit', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: ArrowUpCircle },
    WITHDRAW: { label: t.userStats?.withdraw || 'Withdraw', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: ArrowDownCircle },
    REFUND: { label: t.userStats?.refund || 'Refund', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: RefreshCw },
    OPERATION_DEDUCT: { label: t.userStats?.operationDeduct || 'Operation Deduction', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', icon: TrendingDown },
    CORRECTION: { label: t.userStats?.correctionLabel || 'Correction', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20', icon: Wrench },
})

const getStatusLabels = (t: ReturnType<typeof useTranslation>['t']) => ({
    COMPLETED: { label: t.status?.completed || 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    FAILED: { label: t.status?.failed || 'Failed', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    CANCELLED: { label: t.status?.cancelled || 'Cancelled', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
    PENDING: { label: t.status?.pending || 'Pending', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    PROCESSING: { label: t.status?.processing || 'Processing', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    AWAITING_CAPTCHA: { label: t.status?.awaitingCaptcha || 'Awaiting Captcha', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    AWAITING_PACKAGE: { label: t.status?.awaitingPackage || 'Awaiting Package', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
    AWAITING_FINAL_CONFIRM: { label: t.status?.awaitingFinalConfirm || 'Awaiting Confirm', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    COMPLETING: { label: t.status?.completing || 'Completing', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
})

export default function UserStatsDialog({ isOpen, onClose, userId, username }: UserStatsDialogProps) {
    const { t, locale } = useTranslation()
    const transactionTypeLabels = getTransactionTypeLabels(t)
    const statusLabels = getStatusLabels(t)

    const getDateLocale = () => {
        switch (locale) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [data, setData] = useState<StatsData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'transactions' | 'operations'>('transactions')
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [operations, setOperations] = useState<Operation[]>([])
    const [txHasMore, setTxHasMore] = useState(false)
    const [opHasMore, setOpHasMore] = useState(false)
    const [txTotal, setTxTotal] = useState(0)
    const [opTotal, setOpTotal] = useState(0)
    const [correcting, setCorrecting] = useState<string | null>(null)
    const [correctionSuccess, setCorrectionSuccess] = useState<string | null>(null)
    
    // Correction dialog state
    const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false)
    const [selectedAlert, setSelectedAlert] = useState<{type: string; operationId?: string} | null>(null)
    const [correctionType, setCorrectionType] = useState<'INITIALIZE_BALANCE' | 'BALANCE_MISMATCH' | 'ADD_MISSING'>('BALANCE_MISMATCH')
    const [correctionNotes, setCorrectionNotes] = useState('')

    const fetchStats = useCallback(async (loadMore = false, type?: 'transactions' | 'operations') => {
        if (!userId) return

        if (loadMore) {
            setLoadingMore(true)
        } else {
            setLoading(true)
            setError(null)
        }

        try {
            const txSkip = loadMore && type === 'transactions' ? transactions.length : 0
            const opSkip = loadMore && type === 'operations' ? operations.length : 0

            const res = await fetch(`/api/admin/users/${userId}/stats?txLimit=20&txSkip=${txSkip}&opLimit=20&opSkip=${opSkip}`)
            const result = await res.json()

            if (!res.ok) {
                            setError(result.error || t.common?.error || 'Error')
                return
            }

            if (loadMore) {
                if (type === 'transactions') {
                    setTransactions(prev => [...prev, ...result.recentTransactions])
                    setTxHasMore(result.pagination.transactions.hasMore)
                } else if (type === 'operations') {
                    setOperations(prev => [...prev, ...result.recentOperations])
                    setOpHasMore(result.pagination.operations.hasMore)
                }
            } else {
                setData(result)
                setTransactions(result.recentTransactions)
                setOperations(result.recentOperations)
                setTxHasMore(result.pagination.transactions.hasMore)
                setOpHasMore(result.pagination.operations.hasMore)
                setTxTotal(result.pagination.transactions.total)
                setOpTotal(result.pagination.operations.total)
            }
        } catch {
            setError(t.userStats?.connectionFailed || 'Failed to connect to server')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [userId, transactions.length, operations.length])

    useEffect(() => {
        if (isOpen && userId) {
            // Reset state when opening
            setTransactions([])
            setOperations([])
            fetchStats()
        }
    }, [isOpen, userId])

    const handleLoadMore = (type: 'transactions' | 'operations') => {
        fetchStats(true, type)
    }

    const handleCorrect = async (alertType: string, operationId?: string) => {
        if (!userId) return

        // For BALANCE_MISMATCH, open the dialog instead of auto-correcting
        if (alertType === 'BALANCE_MISMATCH') {
            setSelectedAlert({ type: alertType, operationId })
            // Set default based on discrepancy direction
            if (data && data.financials.discrepancy > 0) {
                setCorrectionType('BALANCE_MISMATCH') // Default to deduct for positive discrepancy
            } else {
                setCorrectionType('ADD_MISSING') // Default to add for negative discrepancy
            }
            setCorrectionNotes('')
            setCorrectionDialogOpen(true)
            return
        }

        // For DOUBLE_REFUND and OVER_REFUND, proceed directly
        await submitCorrection(alertType, operationId)
    }

    const submitCorrection = async (alertType: string, operationId?: string, notes?: string) => {
        if (!userId) return

        const key = `${alertType}-${operationId || 'none'}`
        setCorrecting(key)
        setCorrectionSuccess(null)

        try {
            const res = await fetch(`/api/admin/users/${userId}/correct-balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: alertType, operationId, notes })
            })

            const result = await res.json()

            if (!res.ok) {
                throw new Error(result.error || t.userStats?.correctionFailed || 'Correction failed')
            }

            if (result.corrected) {
                setCorrectionSuccess(key)
                setCorrectionDialogOpen(false)
                // Refresh stats after correction
                setTimeout(() => {
                    setTransactions([])
                    setOperations([])
                    fetchStats()
                    setCorrectionSuccess(null)
                }, 1000)
            } else if (result.alreadyCorrected) {
                alert(result.message)
                setCorrectionDialogOpen(false)
            } else {
                alert(result.message)
            }
        } catch (err) {
            console.error('Correction error:', err)
            alert(err instanceof Error ? err.message : t.common?.error || 'Error')
        } finally {
            setCorrecting(null)
        }
    }

    const handleCorrectionDialogSubmit = () => {
        if (!selectedAlert) return
        submitCorrection(correctionType, selectedAlert.operationId, correctionNotes)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* Dialog */}
            <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/50">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        {t.userStats?.title || 'User Statistics'}: {username}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors"
                        title={t.userStats?.close || 'Close'}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 text-red-500">
                            <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                            <p>{error}</p>
                        </div>
                    ) : data ? (
                        <div className="space-y-6">
                            {/* Financial Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                                        <ArrowUpCircle className="w-5 h-5" />
                                        <span className="text-sm font-medium">{t.userStats?.deposits || 'Deposits'}</span>
                                    </div>
                                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                                        ${data.financials.totalDeposits.toLocaleString()}
                                    </p>
                                </div>

                                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
                                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-2">
                                        <TrendingDown className="w-5 h-5" />
                                        <span className="text-sm font-medium">{t.userStats?.deductions || 'Deductions'}</span>
                                    </div>
                                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                                        ${data.financials.totalDeductions.toLocaleString()}
                                    </p>
                                </div>

                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                                        <RefreshCw className="w-5 h-5" />
                                        <span className="text-sm font-medium">{t.userStats?.refunds || 'Refunds'}</span>
                                    </div>
                                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                        ${data.financials.totalRefunds.toLocaleString()}
                                    </p>
                                </div>

                                <div className={`rounded-xl p-4 border ${data.financials.isBalanceValid
                                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
                                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                    }`}>
                                    <div className={`flex items-center gap-2 mb-2 ${data.financials.isBalanceValid
                                        ? 'text-purple-600 dark:text-purple-400'
                                        : 'text-red-600 dark:text-red-400'
                                        }`}>
                                        <Wallet className="w-5 h-5" />
                                        <span className="text-sm font-medium">{t.userStats?.currentBalance || 'Current Balance'}</span>
                                    </div>
                                    <p className={`text-2xl font-bold ${data.financials.isBalanceValid
                                        ? 'text-purple-700 dark:text-purple-300'
                                        : 'text-red-700 dark:text-red-300'
                                        }`}>
                                        ${data.financials.actualBalance.toLocaleString()}
                                    </p>
                                    <p className={`text-xs ${data.financials.isBalanceValid
                                        ? 'text-purple-600 dark:text-purple-400'
                                        : 'text-red-600 dark:text-red-400'
                                        }`}>
                                        {data.financials.isBalanceValid ? `✓ ${t.userStats?.balanced || 'Balanced'}` : `${t.userStats?.discrepancy || 'Discrepancy'}: $${data.financials.discrepancy.toFixed(2)}`}
                                    </p>
                                </div>
                            </div>

                            {/* Balance Audit Breakdown Table */}
                            <div className="bg-secondary/30 rounded-xl p-4 border border-border">
                                <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                                    <DollarSign className="w-5 h-5" />
                                    {t.userStats?.audit?.title || 'تفاصيل حساب الرصيد'}
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-secondary text-xs">
                                            <tr>
                                                <th className="px-3 py-2 text-right">{t.userStats?.audit?.type || 'النوع'}</th>
                                                <th className="px-3 py-2 text-right">{t.userStats?.audit?.direction || 'الاتجاه'}</th>
                                                <th className="px-3 py-2 text-right">{t.userStats?.audit?.total || 'المجموع'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            <tr className="hover:bg-secondary/50">
                                                <td className="px-3 py-2 flex items-center gap-2">
                                                    <ArrowUpCircle className="w-4 h-4 text-green-500" />
                                                    {t.userStats?.deposits || 'الإيداعات'}
                                                </td>
                                                <td className="px-3 py-2 text-green-600">+</td>
                                                <td className="px-3 py-2 font-medium text-green-600">+${data.financials.totalDeposits.toLocaleString()}</td>
                                            </tr>
                                            <tr className="hover:bg-secondary/50">
                                                <td className="px-3 py-2 flex items-center gap-2">
                                                    <TrendingDown className="w-4 h-4 text-orange-500" />
                                                    {t.userStats?.audit?.operations || 'العمليات'}
                                                </td>
                                                <td className="px-3 py-2 text-orange-600">-</td>
                                                <td className="px-3 py-2 font-medium text-orange-600">-${data.financials.totalDeductions.toLocaleString()}</td>
                                            </tr>
                                            <tr className="hover:bg-secondary/50">
                                                <td className="px-3 py-2 flex items-center gap-2">
                                                    <RefreshCw className="w-4 h-4 text-blue-500" />
                                                    {t.userStats?.refunds || 'الاستردادات'}
                                                </td>
                                                <td className="px-3 py-2 text-blue-600">+</td>
                                                <td className="px-3 py-2 font-medium text-blue-600">+${data.financials.totalRefunds.toLocaleString()}</td>
                                            </tr>
                                            <tr className="hover:bg-secondary/50">
                                                <td className="px-3 py-2 flex items-center gap-2">
                                                    <ArrowDownCircle className="w-4 h-4 text-red-500" />
                                                    {t.userStats?.audit?.withdrawals || 'السحوبات'}
                                                </td>
                                                <td className="px-3 py-2 text-red-600">-</td>
                                                <td className="px-3 py-2 font-medium text-red-600">-${data.financials.totalWithdrawals.toLocaleString()}</td>
                                            </tr>
                                            <tr className="hover:bg-secondary/50">
                                                <td className="px-3 py-2 flex items-center gap-2">
                                                    <Wrench className="w-4 h-4 text-purple-500" />
                                                    {t.userStats?.audit?.corrections || 'التصحيحات'}
                                                </td>
                                                <td className="px-3 py-2 text-purple-600">±</td>
                                                <td className={`px-3 py-2 font-medium ${data.financials.totalCorrections >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {data.financials.totalCorrections >= 0 ? '+' : ''}${data.financials.totalCorrections.toLocaleString()}
                                                </td>
                                            </tr>
                                            <tr className="bg-secondary/70 font-bold">
                                                <td className="px-3 py-2">{t.userStats?.audit?.expected || 'الرصيد المتوقع'}</td>
                                                <td className="px-3 py-2">=</td>
                                                <td className="px-3 py-2">${data.financials.expectedBalance.toLocaleString()}</td>
                                            </tr>
                                            <tr className="bg-secondary/70 font-bold">
                                                <td className="px-3 py-2">{t.userStats?.audit?.actual || 'الرصيد الفعلي'}</td>
                                                <td className="px-3 py-2"></td>
                                                <td className="px-3 py-2">${data.financials.actualBalance.toLocaleString()}</td>
                                            </tr>
                                            {!data.financials.isBalanceValid && (
                                                <tr className={`font-bold ${data.financials.discrepancy > 0 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                                                    <td className="px-3 py-2 flex items-center gap-2">
                                                        <AlertTriangle className="w-4 h-4" />
                                                        {t.userStats?.correction?.difference || 'الفرق'}
                                                    </td>
                                                    <td className="px-3 py-2"></td>
                                                    <td className="px-3 py-2">
                                                        {data.financials.discrepancy > 0 ? '+' : ''}${data.financials.discrepancy.toFixed(2)}
                                                        <span className="text-xs ms-1">
                                                            ({data.financials.discrepancy > 0 
                                                                ? (t.userStats?.audit?.needsCorrection || 'يحتاج تصحيح')
                                                                : (t.userStats?.correction?.deficit || 'نقص')})
                                                        </span>
                                                    </td>
                                                </tr>
                                            )}
                                            {data.financials.isBalanceValid && (
                                                <tr className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold">
                                                    <td className="px-3 py-2 flex items-center gap-2" colSpan={3}>
                                                        <CheckCircle className="w-4 h-4" />
                                                        {t.userStats?.audit?.balanced || 'الرصيد متطابق'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Alerts */}
                            {data.alerts.length > 0 && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                                    <h3 className="font-bold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        {t.userStats?.alerts?.title || 'Alerts'} ({data.alerts.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {data.alerts.map((alert, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                                                <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                                                    <span></span>
                                                    <span>{alert.message}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleCorrect(alert.type, alert.operationId)}
                                                    disabled={correcting === `${alert.type}-${alert.operationId || 'none'}`}
                                                    className="flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-xs font-medium transition-colors"
                                                    title={t.userStats?.alerts?.correct || 'Correct'}
                                                >
                                                    {correcting === `${alert.type}-${alert.operationId || 'none'}` ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : correctionSuccess === `${alert.type}-${alert.operationId || 'none'}` ? (
                                                        <>
                                                            <CheckCircle className="w-3 h-3" />
                                                            {t.userStats?.alerts?.done || 'Done'}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Wrench className="w-3 h-3" />
                                                            {t.userStats?.alerts?.correct || 'Correct'}
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Correction Dialog (Inline Modal) */}
                            {correctionDialogOpen && data && (
                                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                                    <div className="absolute inset-0 bg-black/50" onClick={() => setCorrectionDialogOpen(false)} />
                                    <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                            <Wrench className="w-5 h-5 text-amber-500" />
                                            {t.userStats?.correction?.dialogTitle || 'تصحيح الرصيد'}
                                        </h3>
                                        
                                        {/* Balance Summary */}
                                        <div className="bg-secondary/50 rounded-lg p-4 mb-4 space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{t.userStats?.correction?.currentBalance || 'الرصيد الحالي'}:</span>
                                                <span className="font-bold">${data.financials.actualBalance.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{t.userStats?.correction?.expectedBalance || 'الرصيد المتوقع'}:</span>
                                                <span className="font-bold">${data.financials.expectedBalance.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between border-t border-border pt-2">
                                                <span className="text-muted-foreground">{t.userStats?.correction?.difference || 'الفرق'}:</span>
                                                <span className={`font-bold ${data.financials.discrepancy > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {data.financials.discrepancy > 0 ? '+' : ''}${data.financials.discrepancy.toFixed(2)}
                                                    <span className="text-xs ms-1">
                                                        ({data.financials.discrepancy > 0 
                                                            ? (t.userStats?.correction?.excess || 'زيادة')
                                                            : (t.userStats?.correction?.deficit || 'نقص')})
                                                    </span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Correction Options */}
                                        <div className="space-y-3 mb-4">
                                            <p className="text-sm font-medium">{t.userStats?.correction?.chooseMethod || 'اختر طريقة التصحيح'}:</p>
                                            
                                            {data.financials.discrepancy > 0 ? (
                                                <>
                                                    {/* Option 1: Add as Initial Balance */}
                                                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                                        correctionType === 'INITIALIZE_BALANCE' 
                                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
                                                            : 'border-border hover:bg-secondary/50'
                                                    }`}>
                                                        <input
                                                            type="radio"
                                                            name="correctionType"
                                                            checked={correctionType === 'INITIALIZE_BALANCE'}
                                                            onChange={() => setCorrectionType('INITIALIZE_BALANCE')}
                                                            className="mt-1"
                                                        />
                                                        <div>
                                                            <p className="font-medium">{t.userStats?.correction?.addInitial || 'إضافة كرصيد مبدئي'}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {t.userStats?.correction?.addInitialDesc || 'يسجل المبلغ كإيداع مبدئي في سجل المعاملات'}
                                                            </p>
                                                        </div>
                                                    </label>

                                                    {/* Option 2: Deduct Excess (Default) */}
                                                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                                        correctionType === 'BALANCE_MISMATCH' 
                                                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' 
                                                            : 'border-border hover:bg-secondary/50'
                                                    }`}>
                                                        <input
                                                            type="radio"
                                                            name="correctionType"
                                                            checked={correctionType === 'BALANCE_MISMATCH'}
                                                            onChange={() => setCorrectionType('BALANCE_MISMATCH')}
                                                            className="mt-1"
                                                        />
                                                        <div>
                                                            <p className="font-medium">{t.userStats?.correction?.deductExcess || 'خصم الرصيد الزائد'}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {t.userStats?.correction?.deductExcessDesc || 'يخصم الفرق من رصيد المستخدم'}
                                                            </p>
                                                        </div>
                                                    </label>
                                                </>
                                            ) : (
                                                /* Negative discrepancy - Add Missing */
                                                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                                    correctionType === 'ADD_MISSING' 
                                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                                                        : 'border-border hover:bg-secondary/50'
                                                }`}>
                                                    <input
                                                        type="radio"
                                                        name="correctionType"
                                                        checked={correctionType === 'ADD_MISSING'}
                                                        onChange={() => setCorrectionType('ADD_MISSING')}
                                                        className="mt-1"
                                                    />
                                                    <div>
                                                        <p className="font-medium">{t.userStats?.correction?.addMissing || 'إضافة المبلغ الناقص'}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {t.userStats?.correction?.addMissingDesc || 'يضيف المبلغ الناقص إلى رصيد المستخدم'}
                                                        </p>
                                                    </div>
                                                </label>
                                            )}
                                        </div>

                                        {/* Notes Input */}
                                        <div className="mb-4">
                                            <label className="block text-sm font-medium mb-2">
                                                {t.userStats?.correction?.notes || 'ملاحظات'} ({t.common?.optional || 'اختياري'})
                                            </label>
                                            <input
                                                type="text"
                                                value={correctionNotes}
                                                onChange={(e) => setCorrectionNotes(e.target.value)}
                                                placeholder={t.userStats?.correction?.notesPlaceholder || 'سبب التصحيح...'}
                                                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                        </div>

                                        {/* Warning for deduct */}
                                        {correctionType === 'BALANCE_MISMATCH' && data.financials.discrepancy > data.financials.actualBalance && (
                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4 text-sm text-amber-700 dark:text-amber-400">
                                                <AlertTriangle className="w-4 h-4 inline-block me-1" />
                                                {t.userStats?.correction?.willSetToZero || 'سيتم تصفير الرصيد لأن الفرق أكبر من الرصيد الحالي'}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-3 justify-end">
                                            <button
                                                onClick={() => setCorrectionDialogOpen(false)}
                                                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                                            >
                                                {t.common?.cancel || 'إلغاء'}
                                            </button>
                                            <button
                                                onClick={handleCorrectionDialogSubmit}
                                                disabled={correcting !== null}
                                                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-medium transition-colors"
                                            >
                                                {correcting ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <CheckCircle className="w-4 h-4" />
                                                )}
                                                {t.userStats?.correction?.confirm || 'تأكيد التصحيح'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Operation Stats */}
                            <div className="bg-secondary/50 rounded-xl p-4">
                                <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                                    <DollarSign className="w-5 h-5" />
                                    {t.userStats?.operationStats?.title || 'Operation Statistics'}
                                </h3>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                                    <div className="bg-card rounded-lg p-2">
                                        <p className="text-lg font-bold">{data.operations.total}</p>
                                        <p className="text-xs text-muted-foreground">{t.userStats?.operationStats?.total || 'Total'}</p>
                                    </div>
                                    <div className="bg-card rounded-lg p-2">
                                        <p className="text-lg font-bold text-green-600">{data.operations.completed}</p>
                                        <p className="text-xs text-muted-foreground">{t.userStats?.operationStats?.completed || 'Completed'}</p>
                                    </div>
                                    <div className="bg-card rounded-lg p-2">
                                        <p className="text-lg font-bold text-red-600">{data.operations.failed}</p>
                                        <p className="text-xs text-muted-foreground">{t.userStats?.operationStats?.failed || 'Failed'}</p>
                                    </div>
                                    <div className="bg-card rounded-lg p-2">
                                        <p className="text-lg font-bold text-gray-600">{data.operations.cancelled}</p>
                                        <p className="text-xs text-muted-foreground">{t.userStats?.operationStats?.cancelled || 'Cancelled'}</p>
                                    </div>
                                    <div className="bg-card rounded-lg p-2">
                                        <p className="text-lg font-bold text-yellow-600">{data.operations.pending}</p>
                                        <p className="text-xs text-muted-foreground">{t.userStats?.operationStats?.pending || 'Pending'}</p>
                                    </div>
                                    <div className="bg-card rounded-lg p-2">
                                        <p className="text-lg font-bold text-blue-600">{data.operations.processing}</p>
                                        <p className="text-xs text-muted-foreground">{t.userStats?.operationStats?.processing || 'Processing'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="border-b border-border">
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setActiveTab('transactions')}
                                        className={`pb-2 px-1 font-medium transition-colors ${activeTab === 'transactions'
                                            ? 'text-purple-600 border-b-2 border-purple-600'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {t.userStats?.tabs?.transactions || 'Transactions'} ({txTotal})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('operations')}
                                        className={`pb-2 px-1 font-medium transition-colors ${activeTab === 'operations'
                                            ? 'text-purple-600 border-b-2 border-purple-600'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {t.userStats?.tabs?.operations || 'Operations'} ({opTotal})
                                    </button>
                                </div>
                            </div>

                            {/* Transactions Table */}
                            {activeTab === 'transactions' && (
                                <div className="space-y-4">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-secondary text-xs">
                                                <tr>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.date || 'Date'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.type || 'Type'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.amount || 'Amount'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.balanceAfter || 'Balance After'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.notes || 'Notes'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {transactions.map((tx) => {
                                                    const typeInfo = (transactionTypeLabels as Record<string, typeof transactionTypeLabels['DEPOSIT']>)[tx.type] || { label: tx.type, color: 'text-gray-600 bg-gray-50', icon: DollarSign }
                                                    const Icon = typeInfo.icon
                                                    return (
                                                        <tr key={tx.id} className="hover:bg-secondary/50">
                                                            <td className="px-4 py-2 text-sm">
                                                                {format(new Date(tx.createdAt), 'dd/MM/yyyy HH:mm', { locale: getDateLocale() })}
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
                                                                    <Icon className="w-3 h-3" />
                                                                    {typeInfo.label}
                                                                </span>
                                                            </td>
                                                            <td className={`px-4 py-2 font-bold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                {tx.amount >= 0 ? '+' : ''}${Math.abs(tx.amount).toLocaleString()}
                                                            </td>
                                                            <td className="px-4 py-2 text-sm text-muted-foreground">
                                                                ${tx.balanceAfter.toLocaleString()}
                                                            </td>
                                                            <td className="px-4 py-2 text-sm text-muted-foreground truncate max-w-[200px]">
                                                                {tx.notes || '-'}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Load More Button */}
                                    {txHasMore && (
                                        <div className="text-center">
                                            <button
                                                onClick={() => handleLoadMore('transactions')}
                                                disabled={loadingMore}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                            >
                                                {loadingMore ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4" />
                                                )}
                                                {t.userStats?.loadMore || 'Load More'} ({transactions.length}/{txTotal})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Operations Table */}
                            {activeTab === 'operations' && (
                                <div className="space-y-4">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-secondary text-xs">
                                                <tr>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.date || 'Date'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.type || 'Type'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.card || 'Card'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.amount || 'Amount'}</th>
                                                    <th className="px-4 py-2 text-right">{t.userStats?.table?.status || 'Status'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {operations.map((op) => {
                                                    const statusInfo = (statusLabels as Record<string, typeof statusLabels['COMPLETED']>)[op.status] || { label: op.status, color: 'bg-gray-100 text-gray-700' }
                                                    return (
                                                        <tr key={op.id} className="hover:bg-secondary/50">
                                                            <td className="px-4 py-2 text-sm">
                                                                {format(new Date(op.createdAt), 'dd/MM/yyyy HH:mm', { locale: getDateLocale() })}
                                                            </td>
                                                            <td className="px-4 py-2 text-sm">
                                                                {op.type === 'RENEW' ? t.userStats?.table?.renew || 'Renewal' : op.type}
                                                            </td>
                                                            <td className="px-4 py-2 text-sm font-mono">
                                                                ****{op.cardNumber.slice(-4)}
                                                            </td>
                                                            <td className="px-4 py-2 font-bold">
                                                                ${op.amount.toLocaleString()}
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                                                    {statusInfo.label}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Load More Button */}
                                    {opHasMore && (
                                        <div className="text-center">
                                            <button
                                                onClick={() => handleLoadMore('operations')}
                                                disabled={loadingMore}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                            >
                                                {loadingMore ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4" />
                                                )}
                                                {t.userStats?.loadMore || 'Load More'} ({operations.length}/{opTotal})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
