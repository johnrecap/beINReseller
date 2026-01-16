'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, ExternalLink, XCircle, Clock, AlertCircle, CheckCircle, Package, ShieldCheck, AlertTriangle } from 'lucide-react'

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

const STATUS_CONFIG: Record<OperationStatus, { label: string; color: string; icon: React.ReactNode }> = {
    PENDING: { label: 'في الانتظار', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: <Clock className="w-4 h-4" /> },
    PROCESSING: { label: 'جاري المعالجة', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    AWAITING_CAPTCHA: { label: 'في انتظار الكابتشا', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <AlertCircle className="w-4 h-4" /> },
    AWAITING_PACKAGE: { label: 'في انتظار اختيار الباقة', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: <Package className="w-4 h-4" /> },
    AWAITING_FINAL_CONFIRM: { label: 'في انتظار التأكيد النهائي', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: <ShieldCheck className="w-4 h-4" /> },
    COMPLETING: { label: 'جاري الإتمام', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    COMPLETED: { label: 'مكتملة', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle className="w-4 h-4" /> },
    FAILED: { label: 'فشلت', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className="w-4 h-4" /> },
    CANCELLED: { label: 'ملغاة', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: <XCircle className="w-4 h-4" /> },
}

// Final Confirmation Dialog Component
function FinalConfirmDialog({
    operation,
    onConfirm,
    onCancel,
    isLoading
}: {
    operation: Operation
    onConfirm: () => void
    onCancel: (isAutoCancel?: boolean) => void
    isLoading: boolean
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
            <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-8 h-8" />
                        <div>
                            <h2 className="text-xl font-bold">تأكيد الدفع النهائي</h2>
                            <p className="text-orange-100 text-sm">هذه الخطوة الأخيرة قبل إتمام الشراء</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Package Info */}
                    <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">الباقة:</span>
                            <span className="font-bold text-foreground">{packageInfo?.name || 'غير محدد'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">السعر:</span>
                            <span className="font-bold text-green-600 dark:text-green-400">{packageInfo?.price || operation.amount} USD</span>
                        </div>
                        {operation.stbNumber && (
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">رقم الريسيفر:</span>
                                <span className="font-mono text-sm">{operation.stbNumber}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">رقم الكارت:</span>
                            <span className="font-mono text-sm">****{operation.cardNumber.slice(-4)}</span>
                        </div>
                    </div>

                    {/* Timer */}
                    {timeLeft > 0 && (
                        <div className={`flex items-center justify-center gap-2 ${isWarning ? 'text-red-600 dark:text-red-400 animate-pulse' : 'text-orange-600 dark:text-orange-400'}`}>
                            <Clock className="w-4 h-4" />
                            <span className={`text-sm ${isWarning ? 'font-bold' : ''}`}>
                                الوقت المتبقي: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                            </span>
                        </div>
                    )}

                    {/* Expiry Warning */}
                    {showWarning && (
                        <div className="flex items-center justify-center gap-2 p-3 bg-red-100 dark:bg-red-900/40 rounded-xl border-2 border-red-400 dark:border-red-600 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                            <span className="text-sm font-bold text-red-700 dark:text-red-300">
                                ⚠️ سيتم إلغاء العملية تلقائياً!
                            </span>
                        </div>
                    )}

                    {/* Warning */}
                    <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">
                            <strong>تحذير:</strong> عند الضغط على &quot;تأكيد الدفع&quot;، سيتم إتمام عملية الشراء ولن يمكن إلغاؤها أو استردادها.
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-6 pt-0 flex gap-3">
                    <button
                        onClick={() => onCancel(false)}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                جاري التأكيد...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                تأكيد الدفع
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function ActiveOperationsPage() {
    const router = useRouter()
    const [operations, setOperations] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [confirmingOperation, setConfirmingOperation] = useState<Operation | null>(null)
    const [isConfirmLoading, setIsConfirmLoading] = useState(false)

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
            setError('فشل في جلب العمليات')
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
        if (!confirm('هل أنت متأكد من إلغاء هذه العملية؟')) return

        try {
            await fetch(`/api/operations/${operationId}/cancel`, { method: 'POST' })
            fetchOperations()
        } catch {
            alert('فشل في إلغاء العملية')
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
                alert(data.error || 'فشل في تأكيد الدفع')
            }
        } catch {
            alert('حدث خطأ في الاتصال')
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
                    alert('تم إلغاء العملية تلقائياً لانتهاء المهلة واسترداد المبلغ')
                }
            } else {
                alert(data.error || 'فشل في إلغاء العملية')
            }
        } catch {
            alert('حدث خطأ في الاتصال')
        } finally {
            setIsConfirmLoading(false)
        }
    }, [confirmingOperation, fetchOperations])

    const getElapsedTime = (createdAt: string) => {
        const created = new Date(createdAt).getTime()
        const now = Date.now()
        const diffMs = now - created
        const diffSec = Math.floor(diffMs / 1000)

        if (diffSec < 60) return `${diffSec} ثانية`
        const diffMin = Math.floor(diffSec / 60)
        if (diffMin < 60) return `${diffMin} دقيقة`
        const diffHour = Math.floor(diffMin / 60)
        return `${diffHour} ساعة`
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64" dir="rtl">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Final Confirm Dialog */}
            {confirmingOperation && (
                <FinalConfirmDialog
                    operation={confirmingOperation}
                    onConfirm={handleConfirmPurchase}
                    onCancel={handleCancelConfirm}
                    isLoading={isConfirmLoading}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg">
                        <Loader2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">العمليات الجارية</h1>
                        <p className="text-muted-foreground text-sm">متابعة العمليات النشطة</p>
                    </div>
                </div>
                <button
                    onClick={fetchOperations}
                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    تحديث
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {operations.length === 0 ? (
                <div className="bg-card rounded-2xl shadow-lg p-12 text-center">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">لا توجد عمليات جارية</h2>
                    <p className="text-muted-foreground">جميع العمليات مكتملة</p>
                </div>
            ) : (
                <div className="bg-card rounded-2xl shadow-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">الكارت</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">الحالة</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">الوقت المنقضي</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">رسالة</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {operations.map((op) => {
                                const statusConfig = STATUS_CONFIG[op.status]
                                const canContinue = ['AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM'].includes(op.status)
                                const canCancel = ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE'].includes(op.status)
                                const isAwaitingConfirm = op.status === 'AWAITING_FINAL_CONFIRM'

                                return (
                                    <tr key={op.id} className={`hover:bg-muted/30 transition-colors ${isAwaitingConfirm ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                                        <td className="px-4 py-4">
                                            <span className="font-mono text-sm">****{op.cardNumber.slice(-4)}</span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                                                {statusConfig.icon}
                                                {statusConfig.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-muted-foreground">
                                            {getElapsedTime(op.createdAt)}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-muted-foreground max-w-xs truncate">
                                            {op.responseMessage || '-'}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-2">
                                                {canContinue && (
                                                    <button
                                                        onClick={() => handleContinue(op)}
                                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors ${isAwaitingConfirm
                                                            ? 'bg-orange-500 text-white hover:bg-orange-600'
                                                            : 'bg-purple-500 text-white hover:bg-purple-600'
                                                            }`}
                                                    >
                                                        {isAwaitingConfirm ? (
                                                            <>
                                                                <ShieldCheck className="w-3 h-3" />
                                                                تأكيد الدفع
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ExternalLink className="w-3 h-3" />
                                                                متابعة
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                                {canCancel && (
                                                    <button
                                                        onClick={() => handleCancel(op.id)}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                                    >
                                                        <XCircle className="w-3 h-3" />
                                                        إلغاء
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
            )}

            {/* Legend */}
            <div className="bg-card rounded-xl p-4 border border-border">
                <h3 className="font-medium text-foreground mb-3">دليل الحالات:</h3>
                <div className="flex flex-wrap gap-3">
                    {Object.entries(STATUS_CONFIG).slice(0, 6).map(([status, config]) => (
                        <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
                            {config.icon}
                            {config.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}
