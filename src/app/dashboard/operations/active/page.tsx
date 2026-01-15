'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, ExternalLink, XCircle, Clock, AlertCircle, CheckCircle, Package } from 'lucide-react'

type OperationStatus = 'PENDING' | 'PROCESSING' | 'AWAITING_CAPTCHA' | 'AWAITING_PACKAGE' | 'COMPLETING' | 'COMPLETED' | 'FAILED'

interface Operation {
    id: string
    cardNumber: string
    status: OperationStatus
    type: string
    amount: number
    createdAt: string
    updatedAt: string
    responseMessage: string | null
}

const STATUS_CONFIG: Record<OperationStatus, { label: string; color: string; icon: React.ReactNode }> = {
    PENDING: { label: 'في الانتظار', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: <Clock className="w-4 h-4" /> },
    PROCESSING: { label: 'جاري المعالجة', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    AWAITING_CAPTCHA: { label: 'في انتظار الكابتشا', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <AlertCircle className="w-4 h-4" /> },
    AWAITING_PACKAGE: { label: 'في انتظار اختيار الباقة', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: <Package className="w-4 h-4" /> },
    COMPLETING: { label: 'جاري الإتمام', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    COMPLETED: { label: 'مكتملة', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle className="w-4 h-4" /> },
    FAILED: { label: 'فشلت', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className="w-4 h-4" /> },
}

export default function ActiveOperationsPage() {
    const router = useRouter()
    const [operations, setOperations] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchOperations = useCallback(async () => {
        try {
            const res = await fetch('/api/operations?status=active&limit=50')
            const data = await res.json()

            if (data.operations) {
                // Filter only active operations
                const activeOps = data.operations.filter((op: Operation) =>
                    ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING'].includes(op.status)
                )
                setOperations(activeOps)
            }
            setError(null)
        } catch {
            setError('فشل في جلب العمليات')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchOperations()
        // Refresh every 5 seconds
        const interval = setInterval(fetchOperations, 5000)
        return () => clearInterval(interval)
    }, [fetchOperations])

    const handleContinue = (operation: Operation) => {
        if (operation.status === 'AWAITING_CAPTCHA' || operation.status === 'AWAITING_PACKAGE') {
            router.push(`/dashboard/renew?operationId=${operation.id}`)
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
                                const canContinue = ['AWAITING_CAPTCHA', 'AWAITING_PACKAGE'].includes(op.status)
                                const canCancel = ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE'].includes(op.status)

                                return (
                                    <tr key={op.id} className="hover:bg-muted/30 transition-colors">
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
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs hover:bg-purple-600 transition-colors"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        متابعة
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
                    {Object.entries(STATUS_CONFIG).slice(0, 5).map(([status, config]) => (
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
