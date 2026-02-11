'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { useBalance } from '@/hooks/useBalance'
import { Loader2, CreditCard, CheckCircle, XCircle, Clock, AlertTriangle, DollarSign, Package, User, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface InstallmentInfo {
    package: string
    monthsToPay: string
    installment1: number
    installment2: number
    contractStartDate: string
    contractExpiryDate: string
    invoicePrice: number
    dealerPrice: number
}

interface SubscriberInfo {
    name: string
    email: string
    mobile: string
    city: string
    country: string
    homeTel: string
    workTel: string
    fax: string
    stbModel: string
    address: string
    remarks: string
}

type FlowStep = 'input' | 'loading' | 'details' | 'confirming' | 'success' | 'error' | 'no-installment'

// Installment Confirm Dialog - Modal matching FinalConfirmDialog design from Active Operations page
function InstallmentConfirmDialog({
    installment,
    cardNumber,
    balance,
    confirmExpiry,
    onConfirm,
    onClose,
    onExpire,
    isLoading,
    t
}: {
    installment: InstallmentInfo
    cardNumber: string
    balance: number
    confirmExpiry: string
    onConfirm: () => void
    onClose: () => void
    onExpire: () => void
    isLoading: boolean
    t: any
}) {
    const inst = t.installment || {}
    const [timeLeft, setTimeLeft] = useState<number>(0)
    const [showWarning, setShowWarning] = useState(false)
    const hasWarned = useRef(false)
    const hasExpired = useRef(false)
    const WARNING_THRESHOLD = 10

    useEffect(() => {
        if (!confirmExpiry) return

        hasWarned.current = false
        hasExpired.current = false

        const updateTimer = () => {
            const expiry = new Date(confirmExpiry).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expiry - now) / 1000))
            setTimeLeft(diff)

            if (diff <= WARNING_THRESHOLD && diff > 0 && !hasWarned.current) {
                hasWarned.current = true
                setShowWarning(true)
            }

            if (diff <= 0 && !hasExpired.current) {
                hasExpired.current = true
                onExpire()
            }
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => {
            clearInterval(interval)
            setShowWarning(false)
        }
    }, [confirmExpiry, onExpire])

    const isWarning = timeLeft <= WARNING_THRESHOLD && timeLeft > 0
    const insufficientBalance = balance < installment.dealerPrice

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
                            <h2 className="text-xl font-bold">{inst.confirmTitle || 'تأكيد الدفع النهائي'}</h2>
                            <p className="text-orange-100 text-sm">{inst.confirmMessage || 'هذه الخطوة الأخيرة قبل إتمام الشراء'}</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Info */}
                    <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{inst.packageLabel || 'الباقة'}:</span>
                            <span className="font-bold text-foreground">{installment.package || inst.notSpecified || 'غير محدد'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{inst.priceLabel || 'السعر'}:</span>
                            <span className="font-bold text-[#00A651]">USD {installment.dealerPrice}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{inst.stbLabel || 'رقم الريسيفر'}:</span>
                            <span className="font-mono text-sm">{installment.monthsToPay || '-'}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-border pt-2 mt-2">
                            <span className="text-muted-foreground">{inst.cardLabel || 'رقم الكارت'}:</span>
                            <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{cardNumber}</span>
                        </div>
                    </div>

                    {/* Balance */}
                    <div className="flex justify-between items-center text-sm px-1">
                        <span className="text-muted-foreground">{inst.yourBalance || 'رصيدك'}:</span>
                        <span className={insufficientBalance ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                            USD {balance}
                        </span>
                    </div>

                    {/* Insufficient Balance Warning */}
                    {insufficientBalance && (
                        <div className="flex items-center justify-center gap-2 p-3 bg-red-500/10 rounded-xl border border-red-500/30">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            <span className="text-sm font-bold text-red-500">{inst.insufficientBalance || 'رصيد غير كافي'}</span>
                        </div>
                    )}

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
                                {inst.expiryWarning || '⚠️ سينتهي الوقت خلال 10 ثواني!'}
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-medium transition-colors disabled:opacity-50"
                        >
                            {inst.cancel || 'إلغاء'}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading || insufficientBalance}
                            className="flex-1 px-4 py-3 bg-[#00A651] hover:bg-[#008f45] text-white rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {inst.confirming || 'جاري التأكيد...'}
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    {inst.payNow || 'تأكيد الدفع'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

/**
 * InstallmentPaymentFlow - Flow for paying monthly installments
 * Step 1: Enter card number -> Load installment details
 * Step 2: Show details with Pay button -> Confirm with timer
 * Step 3: Execute payment -> Show result
 */
export function InstallmentPaymentFlow() {
    const { t } = useTranslation()
    const { balance, refetch: refetchBalance } = useBalance()
    const inst = (t as any).installment || {}

    const [step, setStep] = useState<FlowStep>('input')
    const [cardNumber, setCardNumber] = useState('')
    const [operationId, setOperationId] = useState<string | null>(null)
    const [installment, setInstallment] = useState<InstallmentInfo | null>(null)
    const [subscriber, setSubscriber] = useState<SubscriberInfo | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [resultMessage, setResultMessage] = useState<string | null>(null)
    const [confirmExpiry, setConfirmExpiry] = useState<string | null>(null)
    const [timeLeft, setTimeLeft] = useState<number>(60)
    const [isConfirmLoading, setIsConfirmLoading] = useState(false)
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const hasWarned = useRef(false)

    // Countdown timer for details header display only (auto-cancel handled inside dialog)
    useEffect(() => {
        if (!confirmExpiry || step !== 'details') return

        const updateTimer = () => {
            const expiryTime = new Date(confirmExpiry).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expiryTime - now) / 1000))
            setTimeLeft(diff)
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmExpiry, step])

    // Poll for operation status
    useEffect(() => {
        if (!operationId || step !== 'loading') return

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/operations/${operationId}/installment`)
                const data = await res.json()

                if (data.status === 'AWAITING_FINAL_CONFIRM') {
                    clearInterval(pollInterval)
                    if (data.installment) {
                        setInstallment(data.installment)
                        setSubscriber(data.subscriber)
                        setConfirmExpiry(data.finalConfirmExpiry)
                        hasWarned.current = false
                        setStep('details')
                    }
                } else if (data.status === 'COMPLETED') {
                    clearInterval(pollInterval)
                    // Check if no installment found
                    if (data.message?.includes('لا توجد أقساط')) {
                        setResultMessage(data.message)
                        setStep('no-installment')
                    } else {
                        setResultMessage(data.message || inst.success || 'تم دفع القسط بنجاح')
                        setStep('success')
                        refetchBalance()
                    }
                } else if (data.status === 'FAILED') {
                    clearInterval(pollInterval)
                    setError(data.message || inst.failed || 'فشلت العملية')
                    setStep('error')
                }
            } catch (err) {
                console.error('Poll error:', err)
            }
        }, 2000)

        return () => clearInterval(pollInterval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [operationId, step, refetchBalance])

    // Poll for confirming status
    useEffect(() => {
        if (!operationId || step !== 'confirming') return

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/operations/${operationId}/installment`)
                const data = await res.json()

                if (data.status === 'COMPLETED') {
                    clearInterval(pollInterval)
                    setResultMessage(data.message || inst.success || 'تم دفع القسط بنجاح')
                    setStep('success')
                    refetchBalance()
                } else if (data.status === 'FAILED') {
                    clearInterval(pollInterval)
                    setError(data.message || inst.failed || 'فشلت العملية')
                    setStep('error')
                    refetchBalance()
                }
            } catch (err) {
                console.error('Poll error:', err)
            }
        }, 2000)

        return () => clearInterval(pollInterval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [operationId, step, refetchBalance])

    // Start loading installment
    const handleStart = async () => {
        if (cardNumber.length < 10) {
            toast.error(inst.cardError || 'رقم الكارت يجب أن يكون 10 أرقام على الأقل')
            return
        }

        setError(null)
        setStep('loading')

        try {
            const res = await fetch('/api/operations/start-installment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardNumber })
            })

            const data = await res.json()

            if (!res.ok) {
                if (data.operationId) {
                    toast.error(inst.existingOperation || 'هناك عملية جارية لهذا الكارت', {
                        action: {
                            label: inst.goToOperations || 'للعمليات',
                            onClick: () => {
                                window.location.href = '/dashboard/operations/active'
                            }
                        }
                    })
                    setStep('input')
                    return
                }
                throw new Error(data.error || inst.startFailed || 'فشل في بدء العملية')
            }

            setOperationId(data.operationId)
            toast.success(inst.loadingInstallment || 'جاري تحميل بيانات القسط...')
        } catch (err: any) {
            setError(err.message)
            setStep('error')
        }
    }

    // Confirm payment
    const handleConfirm = async () => {
        if (!operationId) return

        // Check balance
        if (installment && balance < installment.dealerPrice) {
            toast.error(inst.insufficientBalance || 'رصيد غير كافي')
            return
        }

        setIsConfirmLoading(true)

        try {
            const res = await fetch(`/api/operations/${operationId}/confirm-installment`, {
                method: 'POST'
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || inst.confirmFailed || 'فشل في تأكيد الدفع')
            }

            setStep('confirming')
            toast.success(inst.processingPayment || 'جاري إتمام الدفع...')
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setIsConfirmLoading(false)
        }
    }

    // Cancel operation
    const handleCancel = async (isAutoCancel = false) => {
        setStep('error')
        setError(isAutoCancel
            ? (inst.expiredCancel || 'تم إلغاء العملية لانتهاء المهلة')
            : (inst.manualCancel || 'تم إلغاء العملية')
        )
    }

    // Reset flow
    const handleReset = () => {
        setStep('input')
        setCardNumber('')
        setOperationId(null)
        setInstallment(null)
        setSubscriber(null)
        setError(null)
        setResultMessage(null)
        setConfirmExpiry(null)
        setShowConfirmDialog(false)
        hasWarned.current = false
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Installment Confirm Dialog */}
            {showConfirmDialog && installment && confirmExpiry && (
                <InstallmentConfirmDialog
                    installment={installment}
                    cardNumber={cardNumber}
                    balance={balance}
                    confirmExpiry={confirmExpiry}
                    onConfirm={handleConfirm}
                    onClose={() => setShowConfirmDialog(false)}
                    onExpire={() => handleCancel(true)}
                    isLoading={isConfirmLoading}
                    t={t}
                />
            )}
            {/* Input Step */}
            {step === 'input' && (
                <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-[#00A651]" />
                            {inst.title || 'تسديد الأقساط الشهرية'}
                        </CardTitle>
                        <CardDescription>
                            {inst.description || 'أدخل رقم كارت beIN للتحقق من الأقساط المستحقة'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="installmentCard">{inst.cardLabel || 'رقم الكارت'}</Label>
                            <Input
                                id="installmentCard"
                                type="text"
                                value={cardNumber}
                                onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                                placeholder="7517663273"
                                className="mt-2 text-left font-mono text-lg tracking-wider"
                                dir="ltr"
                            />
                            {cardNumber && cardNumber.length < 10 && (
                                <p className="text-xs text-red-500 mt-1">
                                    {inst.cardError || 'رقم الكارت يجب أن يكون 10 أرقام على الأقل'}
                                </p>
                            )}
                        </div>
                        <Button
                            onClick={handleStart}
                            disabled={cardNumber.length < 10}
                            className="w-full bg-[#00A651] hover:bg-[#008f45]"
                        >
                            <CreditCard className="h-4 w-4 ml-2" />
                            {inst.loadButton || 'تحميل بيانات القسط'}
                        </Button>
                    </CardContent>
                </Card>
            )
            }

            {/* Loading Step */}
            {
                step === 'loading' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <Loader2 className="h-12 w-12 animate-spin text-[#00A651] mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">
                                {inst.loadingTitle || 'جاري المعالجة...'}
                            </h3>
                            <p className="text-muted-foreground">
                                {inst.loadingDescription || 'يتم الاتصال بـ beIN واستخراج بيانات القسط'}
                            </p>
                        </CardContent>
                    </Card>
                )
            }

            {/* Details Step - Show installment info with timer (beIN-style table) */}
            {
                step === 'details' && installment && (
                    <div className="space-y-4">
                        {/* beIN-style Purple Header Bar — "Contract Information" + Timer + Pay Button */}
                        <div
                            className="flex items-center justify-between rounded-t-xl px-5 py-3"
                            style={{ background: 'linear-gradient(135deg, #602D92 0%, #7B3FA8 50%, #964DA7 100%)' }}
                        >
                            <span className="text-white font-bold text-base tracking-wide flex items-center gap-2">
                                <Package className="h-5 w-5" />
                                Contract Information
                            </span>
                            <div className="flex items-center gap-3">
                                {/* Timer */}
                                <span className={`flex items-center gap-1 text-sm font-mono font-bold px-3 py-1 rounded-full ${timeLeft <= 10
                                    ? 'bg-red-500/20 text-red-300 animate-pulse'
                                    : 'bg-white/15 text-white/90'
                                    }`}>
                                    <Clock className="h-3.5 w-3.5" />
                                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                                </span>
                                {/* Pay Installment Button */}
                                <Button
                                    onClick={() => setShowConfirmDialog(true)}
                                    disabled={timeLeft <= 0}
                                    size="sm"
                                    className="bg-white/20 hover:bg-white/30 text-white border border-white/30 font-bold text-xs px-4 py-1.5 rounded-lg transition-all disabled:opacity-40"
                                >
                                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                                    {inst.continueToPayment || 'Pay Installment'}
                                </Button>
                            </div>
                        </div>

                        {/* Main Table — matches beIN CustInfo table */}
                        <div className="border border-[#1e3a3a] rounded-b-xl overflow-hidden bg-[#0a1a1a]" dir="ltr">
                            <table className="w-full text-sm border-collapse">
                                <tbody>
                                    {/* Package Row */}
                                    <tr className="border-b border-[#1e3a3a]">
                                        <td className="px-4 py-2.5 bg-[#0d2222] text-[#a0b4b4] font-semibold text-xs whitespace-nowrap border-r border-[#1e3a3a] w-[140px]">
                                            Package:
                                        </td>
                                        <td className="px-4 py-2.5 text-white font-medium" colSpan={3}>
                                            {installment.package}
                                        </td>
                                    </tr>

                                    {/* Months To Pay Row */}
                                    <tr className="border-b border-[#1e3a3a]">
                                        <td className="px-4 py-2.5 bg-[#0d2222] text-[#a0b4b4] font-semibold text-xs whitespace-nowrap border-r border-[#1e3a3a]">
                                            Months To Pay:
                                        </td>
                                        <td className="px-4 py-2.5" colSpan={3}>
                                            <span className="bg-[#1a2f2f] text-white border border-[#2a4a4a] px-3 py-1 rounded text-xs font-medium">
                                                {installment.monthsToPay}
                                            </span>
                                        </td>
                                    </tr>

                                    {/* Installment Amounts - IRD/IEC sub-table (beIN InstallmentTable style) */}
                                    <tr className="border-b border-[#1e3a3a]">
                                        <td colSpan={4} className="p-0">
                                            <table className="w-full text-sm border-collapse">
                                                <thead>
                                                    <tr style={{ background: 'linear-gradient(135deg, #602D92 0%, #7B3FA8 100%)' }}>
                                                        <th className="px-3 py-2 text-left font-bold text-white/80 text-xs border-r border-[#7B3FA8]/50 w-20"></th>
                                                        <th className="px-3 py-2 text-center font-bold text-white text-xs border-r border-[#7B3FA8]/50">
                                                            Installment 1
                                                        </th>
                                                        <th className="px-3 py-2 text-center font-bold text-white text-xs">
                                                            Installment 2
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr className="border-b border-[#1e3a3a]">
                                                        <td className="px-3 py-2 bg-[#0d2222] font-semibold text-[#a0b4b4] text-xs border-r border-[#1e3a3a]">IRD</td>
                                                        <td className="px-3 py-2 text-center border-r border-[#1e3a3a]">
                                                            <span className="inline-block min-w-[60px]">
                                                                <span className="text-white text-xs font-medium">{installment.installment1}</span>
                                                                <div className="w-full h-[2px] my-1" style={{ backgroundColor: '#602D92' }}></div>
                                                                <span className="inline-block text-white text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#964DA7' }}>
                                                                    {installment.installment1}
                                                                </span>
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className="text-white text-xs font-medium">{installment.installment1}</span>
                                                            <br />
                                                            <span className="text-red-400 text-xs font-bold">{installment.installment1}</span>
                                                        </td>
                                                    </tr>
                                                    <tr className="border-b border-[#1e3a3a]">
                                                        <td className="px-3 py-2 bg-[#0d2222] font-semibold text-[#a0b4b4] text-xs border-r border-[#1e3a3a]">IEC</td>
                                                        <td className="px-3 py-2 text-center border-r border-[#1e3a3a]">
                                                            <span className="inline-block min-w-[60px]">
                                                                <span className="text-white text-xs font-medium">{installment.installment2}</span>
                                                                <div className="w-full h-[2px] my-1" style={{ backgroundColor: '#602D92' }}></div>
                                                                <span className="inline-block text-white text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#964DA7' }}>
                                                                    {installment.installment2}
                                                                </span>
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className="text-white text-xs font-medium">{installment.installment2}</span>
                                                            <br />
                                                            <span className="text-red-400 text-xs font-bold">{installment.installment2}</span>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>

                                    {/* Dates & Prices — horizontal layout matching beIN */}
                                    <tr className="border-b border-[#1e3a3a]">
                                        <td className="px-4 py-2.5 bg-[#0d2222] text-[#a0b4b4] font-semibold text-xs whitespace-nowrap border-r border-[#1e3a3a]">
                                            Contract Start Date:
                                        </td>
                                        <td className="px-4 py-2.5 text-white text-xs font-mono border-r border-[#1e3a3a]">
                                            {installment.contractStartDate || '-'}
                                        </td>
                                        <td className="px-4 py-2.5 bg-[#0d2222] text-[#a0b4b4] font-semibold text-xs whitespace-nowrap border-r border-[#1e3a3a]">
                                            Invoice Price (USD):
                                        </td>
                                        <td className="px-4 py-2.5 text-white text-xs font-bold">
                                            {installment.invoicePrice}
                                        </td>
                                    </tr>
                                    <tr className="border-b border-[#1e3a3a]">
                                        <td className="px-4 py-2.5 bg-[#0d2222] text-[#a0b4b4] font-semibold text-xs whitespace-nowrap border-r border-[#1e3a3a]">
                                            Contract Expiry Date:
                                        </td>
                                        <td className="px-4 py-2.5 text-white text-xs font-mono border-r border-[#1e3a3a]">
                                            {installment.contractExpiryDate || '-'}
                                        </td>
                                        <td className="px-4 py-2.5 bg-[#0d2222] text-[#a0b4b4] font-semibold text-xs whitespace-nowrap border-r border-[#1e3a3a]">
                                            Dealer Price (USD):
                                        </td>
                                        <td className="px-4 py-2.5 text-xs font-bold text-[#00A651]">
                                            {installment.dealerPrice}
                                        </td>
                                    </tr>

                                    {/* Subscriber Information Section */}
                                    <tr>
                                        <td colSpan={4} className="p-0">
                                            {/* Section Header */}
                                            <div
                                                className="px-4 py-2 text-xs font-bold text-white/90 flex items-center gap-2 border-b border-[#1e3a3a]"
                                                style={{ background: 'linear-gradient(135deg, #602D92 0%, #7B3FA8 100%)' }}
                                            >
                                                <User className="h-3.5 w-3.5" />
                                                Subscriber Information
                                            </div>
                                            <table className="w-full text-xs border-collapse">
                                                <tbody>
                                                    {/* Name | Email */}
                                                    <tr className="border-b border-[#1e3a3a]">
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a] w-[120px]">
                                                            Subscriber Name:
                                                        </td>
                                                        <td className="px-3 py-2 text-white border-r border-[#1e3a3a]">
                                                            {subscriber?.name || '-'}
                                                        </td>
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a] w-[120px]">
                                                            Subscriber Email:
                                                        </td>
                                                        <td className="px-3 py-2 text-white">
                                                            {subscriber?.email || '-'}
                                                        </td>
                                                    </tr>
                                                    {/* Mobile | City */}
                                                    <tr className="border-b border-[#1e3a3a]">
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a]">
                                                            Mobile:
                                                        </td>
                                                        <td className="px-3 py-2 text-white font-mono border-r border-[#1e3a3a]">
                                                            {subscriber?.mobile || '-'}
                                                        </td>
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a]">
                                                            City:
                                                        </td>
                                                        <td className="px-3 py-2 text-white">
                                                            {subscriber?.city || '-'}
                                                        </td>
                                                    </tr>
                                                    {/* Country */}
                                                    <tr className="border-b border-[#1e3a3a]">
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a]">
                                                            Country:
                                                        </td>
                                                        <td className="px-3 py-2 text-white" colSpan={3}>
                                                            {subscriber?.country || '-'}
                                                        </td>
                                                    </tr>
                                                    {/* Home Tel | Work Tel */}
                                                    <tr className="border-b border-[#1e3a3a]">
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a]">
                                                            Home Tel:
                                                        </td>
                                                        <td className="px-3 py-2 text-white font-mono border-r border-[#1e3a3a]">
                                                            {subscriber?.homeTel || '-'}
                                                        </td>
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a]">
                                                            Work Tel:
                                                        </td>
                                                        <td className="px-3 py-2 text-white font-mono">
                                                            {subscriber?.workTel || '-'}
                                                        </td>
                                                    </tr>
                                                    {/* Fax | STB Model */}
                                                    <tr className="border-b border-[#1e3a3a]">
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a]">
                                                            Fax:
                                                        </td>
                                                        <td className="px-3 py-2 text-white font-mono border-r border-[#1e3a3a]">
                                                            {subscriber?.fax || '-'}
                                                        </td>
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a]">
                                                            STB Model:
                                                        </td>
                                                        <td className="px-3 py-2 text-white font-mono">
                                                            {subscriber?.stbModel || '-'}
                                                        </td>
                                                    </tr>
                                                    {/* Address | Remarks */}
                                                    <tr>
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a] align-top">
                                                            Address:
                                                        </td>
                                                        <td className="px-3 py-2 text-white border-r border-[#1e3a3a] align-top">
                                                            {subscriber?.address || '-'}
                                                        </td>
                                                        <td className="px-3 py-2 bg-[#0d2222] text-[#a0b4b4] font-semibold whitespace-nowrap border-r border-[#1e3a3a] align-top">
                                                            Remarks:
                                                        </td>
                                                        <td className="px-3 py-2 text-white align-top">
                                                            {subscriber?.remarks || '-'}
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Bottom Pay Button (mobile-friendly) */}
                        <div className="pt-1">
                            <Button
                                onClick={() => setShowConfirmDialog(true)}
                                disabled={timeLeft <= 0}
                                className="w-full py-3 text-base font-bold text-white rounded-xl transition-all shadow-lg"
                                style={{ background: 'linear-gradient(135deg, #602D92 0%, #964DA7 100%)' }}
                            >
                                <CheckCircle className="h-5 w-5 ml-2" />
                                {inst.continueToPayment || 'متابعة للدفع'}
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* Confirming Step */}
            {
                step === 'confirming' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <Loader2 className="h-12 w-12 animate-spin text-[#00A651] mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">
                                {inst.confirmingTitle || 'جاري تأكيد الدفع...'}
                            </h3>
                            <p className="text-muted-foreground">
                                {inst.confirmingDescription || 'يتم إتمام عملية الدفع على beIN'}
                            </p>
                        </CardContent>
                    </Card>
                )
            }

            {/* Success Step */}
            {
                step === 'success' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">
                                {inst.successTitle || 'تم الدفع بنجاح!'}
                            </h3>
                            <p className="text-muted-foreground mb-6">
                                {resultMessage || inst.successMessage || 'تم دفع القسط بنجاح'}
                            </p>
                            <Button onClick={handleReset} variant="outline">
                                {inst.newOperation || 'عملية جديدة'}
                            </Button>
                        </CardContent>
                    </Card>
                )
            }

            {/* No Installment Step */}
            {
                step === 'no-installment' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <CreditCard className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">
                                {inst.noInstallmentTitle || 'لا توجد أقساط'}
                            </h3>
                            <p className="text-muted-foreground mb-6">
                                {resultMessage || inst.noInstallmentMessage || 'لا توجد أقساط مستحقة لهذا الكارت'}
                            </p>
                            <Button onClick={handleReset} variant="outline">
                                {inst.tryAnother || 'جرب كارت آخر'}
                            </Button>
                        </CardContent>
                    </Card>
                )
            }

            {/* Error Step */}
            {
                step === 'error' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
                                {inst.errorTitle || 'فشلت العملية'}
                            </h3>
                            <p className="text-muted-foreground mb-6">
                                {error}
                            </p>
                            <Button onClick={handleReset} variant="outline">
                                {inst.tryAgain || 'حاول مرة أخرى'}
                            </Button>
                        </CardContent>
                    </Card>
                )
            }
        </div >
    )
}

export default InstallmentPaymentFlow
