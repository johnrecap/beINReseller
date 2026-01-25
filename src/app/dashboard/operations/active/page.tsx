'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, ExternalLink, XCircle, Clock, AlertCircle, CheckCircle, Package, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

type OperationStatus = 'PENDING' | 'PROCESSING' | 'AWAITING_CAPTCHA' | 'AWAITING_PACKAGE' | 'AWAITING_FINAL_CONFIRM' | 'COMPLETING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

interface SelectedPackage {
    index: number
    name: string
    price: number
    checkboxSelector: string
}

interface Operation {
    id: string
    cardNumber: string
    status: OperationStatus
    type: string
    amount: number
    createdAt: string
    updatedAt: string
    responseMessage: string | null
    stbNumber?: string | null
    selectedPackage?: SelectedPackage | null
    finalConfirmExpiry?: string | null
}

const getStatusConfig = (t: ReturnType<typeof useTranslation>['t']) => ({
    PENDING: {
        label: t.status?.pending || 'Pending',
        color: 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30',
        icon: <Clock className="w-4 h-4" />
    },
    PROCESSING: {
        label: t.status?.processing || 'Processing',
        color: 'bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/30',
        icon: <Loader2 className="w-4 h-4 animate-spin" />
    },
    AWAITING_CAPTCHA: {
        label: t.status?.awaitingCaptcha || 'Awaiting Captcha',
        color: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30',
        icon: <AlertCircle className="w-4 h-4" />
    },
    AWAITING_PACKAGE: {
        label: t.status?.awaitingPackage || 'Awaiting Package',
        color: 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30',
        icon: <Package className="w-4 h-4" />
    },
    AWAITING_FINAL_CONFIRM: {
        label: t.status?.awaitingFinalConfirm || 'Awaiting Confirm',
        color: 'bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30',
        icon: <ShieldCheck className="w-4 h-4" />
    },
    COMPLETING: {
        label: t.status?.completing || 'Completing',
        color: 'bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/30',
        icon: <Loader2 className="w-4 h-4 animate-spin" />
    },
    COMPLETED: {
        label: t.status?.completed || 'Completed',
        color: 'bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/30',
        icon: <CheckCircle className="w-4 h-4" />
    },
    FAILED: {
        label: t.status?.failed || 'Failed',
        color: 'bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/30',
        icon: <XCircle className="w-4 h-4" />
    },
    CANCELLED: {
        label: t.status?.cancelled || 'Cancelled',
        color: 'bg-gray-500/10 text-gray-500 border border-gray-500/30',
        icon: <XCircle className="w-4 h-4" />
    },
})

// Filter Tabs Component
interface FilterTab {
    id: OperationStatus
    label: string
    icon: React.ReactNode
    color: string
}

const getFilterTabs = (t: ReturnType<typeof useTranslation>['t']): FilterTab[] => [
    { id: 'PENDING', label: t.activeOperations?.status?.pending || t.status?.pending || 'Pending', icon: <Clock className="w-4 h-4" />, color: '#3B82F6' },
    { id: 'AWAITING_CAPTCHA', label: t.activeOperations?.status?.awaiting_captcha || t.status?.awaitingCaptcha || 'Awaiting Captcha', icon: <AlertCircle className="w-4 h-4" />, color: '#F59E0B' },
    { id: 'AWAITING_PACKAGE', label: t.activeOperations?.status?.awaiting_package || t.status?.awaitingPackage || 'Awaiting Package', icon: <Package className="w-4 h-4" />, color: '#3B82F6' },
    { id: 'AWAITING_FINAL_CONFIRM', label: t.activeOperations?.status?.awaiting_final_confirm || t.status?.awaitingFinalConfirm || 'Awaiting Confirm', icon: <AlertTriangle className="w-4 h-4" />, color: '#F97316' },
    { id: 'COMPLETING', label: t.activeOperations?.status?.completing || t.status?.completing || 'Completing', icon: <Loader2 className="w-4 h-4" />, color: '#00A651' },
    { id: 'PROCESSING', label: t.activeOperations?.status?.processing || t.status?.processing || 'Processing', icon: <RefreshCw className="w-4 h-4" />, color: '#06B6D4' },
]

function FilterTabs({
    activeFilters,
    onFilterChange,
    t
}: {
    activeFilters: OperationStatus[]
    onFilterChange: (status: OperationStatus) => void
    t: ReturnType<typeof useTranslation>['t']
}) {
    const FILTER_TABS = getFilterTabs(t)
    return (
        <div className="flex flex-wrap gap-2 mb-6 animate-in slide-in-from-top-4 duration-500">
            <span className="text-sm text-muted-foreground self-center ml-2 hidden sm:inline">{t.common?.filter || 'Filter'}:</span>
            {FILTER_TABS.map((tab) => {
                const isActive = activeFilters.includes(tab.id)
                return (
                    <button
                        key={tab.id}
                        onClick={() => onFilterChange(tab.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${isActive
                            ? 'text-white border-transparent shadow-md transform scale-105'
                            : 'bg-card text-muted-foreground border-border hover:border-gray-400 dark:hover:border-gray-600'
                            }`}
                        style={isActive ? { backgroundColor: tab.color } : undefined}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                )
            })}
        </div>
    )
}

function OperationSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card rounded-xl p-4 border border-border h-20"></div>
            ))}
        </div>
    )
}

// Final Confirmation Dialog Component (Unchanged logic, updated styles)
function FinalConfirmDialog({
    operation,
    onConfirm,
    onCancel,
    isLoading,
    t
}: {
    operation: Operation
    onConfirm: () => void
    onCancel: (isAutoCancel?: boolean) => void
    isLoading: boolean
    t: ReturnType<typeof useTranslation>['t']
}) {
    const [timeLeft, setTimeLeft] = useState<number>(0)
    const [showWarning, setShowWarning] = useState(false)
    const hasWarned = useRef(false)
    const hasExpired = useRef(false)
    const WARNING_THRESHOLD = 10

    useEffect(() => {
        if (!operation.finalConfirmExpiry) return

        // Reset refs when effect runs
        hasWarned.current = false
        hasExpired.current = false

        const updateTimer = () => {
            const expiry = new Date(operation.finalConfirmExpiry!).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expiry - now) / 1000))
            setTimeLeft(diff)

            // Show warning when reaching threshold
            if (diff <= WARNING_THRESHOLD && diff > 0 && !hasWarned.current) {
                hasWarned.current = true
                setShowWarning(true)
            }

            // Auto-cancel when timer expires
            if (diff <= 0 && !hasExpired.current) {
                hasExpired.current = true
                onCancel(true)  // true = isAutoCancel
            }
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => {
            clearInterval(interval)
            setShowWarning(false)
        }
    }, [operation.finalConfirmExpiry, onCancel])

    const packageInfo = operation.selectedPackage
    const isWarning = timeLeft <= WARNING_THRESHOLD && timeLeft > 0

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
            <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{t.activeOperations?.dialogs?.confirmPaymentTitle || 'Confirm Final Payment'}</h2>
                            <p className="text-orange-100 text-sm">{t.activeOperations?.dialogs?.confirmPaymentDesc || 'This is the last step before completing the purchase'}</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Package Info */}
                    <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t.activeOperations?.dialogs?.package || 'Package'}:</span>
                            <span className="font-bold text-foreground">{packageInfo?.name || t.operations?.notSpecified || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t.activeOperations?.dialogs?.price || 'Price'}:</span>
                            <span className="font-bold text-[#00A651]">{packageInfo?.price || operation.amount} USD</span>
                        </div>
                        {operation.stbNumber && (
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">{t.activeOperations?.dialogs?.stbNumber || 'Receiver Number'}:</span>
                                <span className="font-mono text-sm">{operation.stbNumber}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center border-t border-border pt-2 mt-2">
                            <span className="text-muted-foreground">{t.activeOperations?.dialogs?.cardNumber || 'Card Number'}:</span>
                            <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">****{operation.cardNumber.slice(-4)}</span>
                        </div>
                    </div>

                    {/* Timer */}
                    {timeLeft > 0 && (
                        <div className={`flex items-center justify-center gap-2 py-2 ${isWarning ? 'text-[#ED1C24] animate-pulse font-bold' : 'text-[#F59E0B]'}`}>
                            <Clock className="w-5 h-5" />
                            <span className="text-lg font-mono">
                                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                            </span>
                        </div>
                    )}

                    {/* Expiry Warning */}
                    {showWarning && (
                        <div className="flex items-center justify-center gap-2 p-3 bg-[#ED1C24]/10 rounded-xl border border-[#ED1C24]/30 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-[#ED1C24]" />
                            <span className="text-sm font-bold text-[#ED1C24]">
                                {t.activeOperations?.dialogs?.warning || 'Auto-cancel in 10 seconds!'}
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => onCancel(false)}
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-medium transition-colors disabled:opacity-50"
                        >
                            {t.activeOperations?.dialogs?.cancel || 'Cancel'}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 bg-[#00A651] hover:bg-[#008f45] text-white rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t.activeOperations?.dialogs?.confirming || 'Confirming...'}
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    {t.activeOperations?.dialogs?.confirm || 'Confirm Payment'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function ActiveOperationsPage() {
    const router = useRouter()
    const { t } = useTranslation()
    const STATUS_CONFIG = getStatusConfig(t)
    const [operations, setOperations] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [confirmingOperation, setConfirmingOperation] = useState<Operation | null>(null)
    const [isConfirmLoading, setIsConfirmLoading] = useState(false)
    const [activeFilters, setActiveFilters] = useState<OperationStatus[]>([])

    const fetchOperations = useCallback(async () => {
        try {
            const res = await fetch('/api/operations?status=active&limit=50')
            const data = await res.json()

            if (data.operations) {
                // Filter only active operations (including AWAITING_FINAL_CONFIRM)
                const activeOps = data.operations.filter((op: Operation) =>
                    ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING'].includes(op.status)
                )
                setOperations(activeOps)

                // Auto-open dialog for AWAITING_FINAL_CONFIRM
                const awaitingConfirm = activeOps.find((op: Operation) => op.status === 'AWAITING_FINAL_CONFIRM')
                if (awaitingConfirm && !confirmingOperation) {
                    setConfirmingOperation(awaitingConfirm)
                }
            }
            setError(null)
        } catch {
            setError(t.common?.error || 'Failed to fetch operations')
        } finally {
            setLoading(false)
        }
    }, [confirmingOperation])

    useEffect(() => {
        fetchOperations()
        // Refresh every 5 seconds
        const interval = setInterval(fetchOperations, 5000)
        return () => clearInterval(interval)
    }, [fetchOperations])

    const handleContinue = (operation: Operation) => {
        if (operation.status === 'AWAITING_CAPTCHA' || operation.status === 'AWAITING_PACKAGE') {
            router.push(`/dashboard/renew?operationId=${operation.id}`)
        } else if (operation.status === 'AWAITING_FINAL_CONFIRM') {
            setConfirmingOperation(operation)
        }
    }

    const handleCancel = async (operationId: string) => {
        if (!confirm(t.common?.cancelConfirmation || 'Are you sure you want to cancel this operation?')) return

        try {
            await fetch(`/api/operations/${operationId}/cancel`, { method: 'POST' })
            fetchOperations()
        } catch {
            alert(t.activeOperations?.messages?.cancelFailed || 'Failed to cancel operation')
        }
    }

    const handleConfirmPurchase = async () => {
        if (!confirmingOperation) return

        setIsConfirmLoading(true)
        try {
            const res = await fetch(`/api/operations/${confirmingOperation.id}/confirm-purchase`, { method: 'POST' })
            const data = await res.json()

            if (res.ok) {
                setConfirmingOperation(null)
                fetchOperations()
            } else {
                alert(data.error || t.activeOperations?.messages?.confirmFailed || 'Payment confirmation failed')
            }
        } catch {
            alert(t.common?.connectionError || 'Connection error')
        } finally {
            setIsConfirmLoading(false)
        }
    }

    const handleCancelConfirm = useCallback(async (isAutoCancel = false) => {
        if (!confirmingOperation) return

        setIsConfirmLoading(true)
        try {
            const res = await fetch(`/api/operations/${confirmingOperation.id}/cancel-confirm`, { method: 'POST' })
            const data = await res.json()

            if (res.ok) {
                setConfirmingOperation(null)
                fetchOperations()
                if (isAutoCancel) {
                    alert(t.activeOperations?.messages?.autoCancel || 'Operation auto-cancelled due to timeout. Amount refunded.')
                }
            } else {
                alert(data.error || t.activeOperations?.messages?.cancelFailed || 'Failed to cancel operation')
            }
        } catch {
            alert(t.common?.connectionError || 'Connection error')
        } finally {
            setIsConfirmLoading(false)
        }
    }, [confirmingOperation, fetchOperations])

    const getElapsedTime = (createdAt: string) => {
        const created = new Date(createdAt).getTime()
        const now = Date.now()
        const diffMs = now - created
        const diffSec = Math.floor(diffMs / 1000)

        if (diffSec < 60) return `${diffSec} ${t.common?.seconds || 'seconds'}`
        const diffMin = Math.floor(diffSec / 60)
        if (diffMin < 60) return `${diffMin} ${t.common?.minutes || 'minutes'}`
        const diffHour = Math.floor(diffMin / 60)
        return `${diffHour} ${t.common?.hours || 'hours'}`
    }

    // Filter Logic
    const handleFilterChange = (status: OperationStatus) => {
        setActiveFilters(prev =>
            prev.includes(status)
                ? prev.filter(s => s !== status)
                : [...prev, status]
        )
    }

    const filteredOperations = activeFilters.length === 0
        ? operations
        : operations.filter(op => activeFilters.includes(op.status))

    return (
        <div className="space-y-6" dir="rtl">
            {/* Final Confirm Dialog */}
            {confirmingOperation && (
                <FinalConfirmDialog
                    operation={confirmingOperation}
                    onConfirm={handleConfirmPurchase}
                    onCancel={handleCancelConfirm}
                    isLoading={isConfirmLoading}
                    t={t}
                />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-6 rounded-2xl shadow-sm border border-border animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 rounded-full bg-[#F59E0B] flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
                        <RefreshCw className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.activeOperations?.title || 'Active Operations'}</h1>
                        <p className="text-muted-foreground text-sm">{t.activeOperations?.subtitle || 'Track ongoing operations and their status'}</p>
                    </div>
                </div>
                <button
                    onClick={fetchOperations}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 border border-[#374151] rounded-xl hover:bg-muted transition-colors text-sm font-medium"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {t.activeOperations?.refresh || 'Refresh'}
                </button>
            </div>

            {error && (
                <div className="p-4 bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/20 rounded-xl animate-in fade-in">
                    {error}
                </div>
            )}

            {/* Main Content */}
            <div className="min-h-[400px]">
                {loading && operations.length === 0 ? (
                    <OperationSkeleton />
                ) : operations.length === 0 ? (
                    /* Empty State */
                    <div className="max-w-[600px] mx-auto mt-12 mb-12">
                        <div className="bg-card rounded-3xl shadow-xl p-12 text-center border border-border animate-in zoom-in-95 duration-500">
                            <div className="w-24 h-24 mx-auto mb-6 rounded-full border-[3px] border-[#00A651] flex items-center justify-center animate-in zoom-in duration-500 delay-100 bg-[#00A651]/5">
                                <CheckCircle className="w-10 h-10 text-[#00A651]" />
                            </div>

                            <h2 className="text-2xl font-bold text-foreground mb-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
                                {t.activeOperations?.noOperations || 'No Active Operations'}
                            </h2>
                            <p className="text-muted-foreground mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
                                {t.activeOperations?.allComplete || 'All operations completed successfully. Start a new operation now.'}
                            </p>

                            <button
                                onClick={() => router.push('/dashboard/renew')}
                                className="px-8 py-3.5 bg-[#00A651] hover:bg-[#008f45] text-white rounded-xl font-bold transition-all shadow-lg shadow-green-500/30 hover:shadow-green-500/40 hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-400"
                            >
                                {t.activeOperations?.startNew || 'Start New Operation'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <FilterTabs activeFilters={activeFilters} onFilterChange={handleFilterChange} t={t} />

                        {filteredOperations.length === 0 ? (
                            <div className="text-center py-12 bg-card rounded-2xl border border-border border-dashed">
                                <p className="text-muted-foreground">{t.activeOperations?.noOperationsWithStatus || 'No operations with this status'}</p>
                            </div>
                        ) : (
                            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden animate-in fade-in duration-500">
                                {/* Desktop/Tablet Table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-muted/30 border-b border-border">
                                            <tr>
                                                <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.activeOperations?.table?.cardNumber || 'Card'}</th>
                                                <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.activeOperations?.table?.status || 'Status'}</th>
                                                <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.activeOperations?.table?.timeAndAmount || 'Time & Amount'}</th>
                                                <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.activeOperations?.table?.actions || 'Actions'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {filteredOperations.map((op, index) => {
                                                const statusConfig = STATUS_CONFIG[op.status]
                                                const canContinue = ['AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM'].includes(op.status)
                                                // Removed cancellation for pending/processing as per business logic, or keep if required
                                                const canCancel = ['PENDING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE'].includes(op.status)
                                                const isAwaitingConfirm = op.status === 'AWAITING_FINAL_CONFIRM'

                                                return (
                                                    <tr
                                                        key={op.id}
                                                        className={`hover:bg-muted/30 transition-colors ${isAwaitingConfirm ? 'bg-[#F97316]/5' : ''} animate-in fade-in`}
                                                        style={{ animationDelay: `${index * 50}ms` }}
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-mono font-medium text-foreground text-lg">**** {op.cardNumber.slice(-4)}</span>
                                                                <span className="text-xs text-muted-foreground">ID: {op.id.slice(0, 8)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color} shadow-sm`}>
                                                                {statusConfig.icon}
                                                                {statusConfig.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-sm font-medium">{getElapsedTime(op.createdAt)}</span>
                                                                {op.amount > 0 && (
                                                                    <span className="text-xs text-[#00A651] font-bold">{op.amount} USD</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                {canContinue && (
                                                                    <button
                                                                        onClick={() => handleContinue(op)}
                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${isAwaitingConfirm
                                                                            ? 'bg-[#F97316] hover:bg-[#F97316]/90 text-white animate-pulse'
                                                                            : 'bg-[#00A651] hover:bg-[#00A651]/90 text-white'
                                                                            }`}
                                                                    >
                                                                        {isAwaitingConfirm ? (
                                                                            <>
                                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                                                {t.activeOperations?.actions?.confirmPayment || 'Confirm Payment'}
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                                {t.activeOperations?.actions?.continue || 'Continue'}
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                )}
                                                                {canCancel && (
                                                                    <button
                                                                        onClick={() => handleCancel(op.id)}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/20 rounded-lg text-xs font-medium hover:bg-[#ED1C24]/20 transition-colors"
                                                                    >
                                                                    <XCircle className="w-3.5 h-3.5" />
                                                                        {t.activeOperations?.actions?.cancel || 'Cancel'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile List View */}
                                <div className="md:hidden divide-y divide-border">
                                    {filteredOperations.map((op, index) => {
                                        const statusConfig = STATUS_CONFIG[op.status]
                                        const canContinue = ['AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM'].includes(op.status)
                                        const canCancel = ['PENDING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE'].includes(op.status)
                                        const isAwaitingConfirm = op.status === 'AWAITING_FINAL_CONFIRM'

                                        return (
                                            <div
                                                key={op.id}
                                                className={`p-4 animate-in fade-in ${isAwaitingConfirm ? 'bg-[#F97316]/5' : ''}`}
                                                style={{ animationDelay: `${index * 50}ms` }}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <span className="font-mono font-bold text-lg text-foreground">**** {op.cardNumber.slice(-4)}</span>
                                                        <div className="text-xs text-muted-foreground mt-0.5">{getElapsedTime(op.createdAt)}</div>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${statusConfig.color}`}>
                                                        {statusConfig.icon}
                                                        {statusConfig.label}
                                                    </span>
                                                </div>

                                                <div className="flex gap-2 mt-4">
                                                    {canContinue && (
                                                        <button
                                                            onClick={() => handleContinue(op)}
                                                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isAwaitingConfirm
                                                                ? 'bg-[#F97316] text-white'
                                                                : 'bg-[#00A651] text-white'
                                                                }`}
                                                        >
                                                            {isAwaitingConfirm ? t.activeOperations?.actions?.confirmPayment || 'Confirm Payment' : t.activeOperations?.actions?.continue || 'Continue'}
                                                        </button>
                                                    )}
                                                    {canCancel && (
                                                        <button
                                                            onClick={() => handleCancel(op.id)}
                                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/20 rounded-lg text-sm font-medium"
                                                        >
                                                            {t.activeOperations?.actions?.cancel || 'Cancel'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
