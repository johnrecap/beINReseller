'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { useBalance } from '@/hooks/useBalance'
import { Loader2, CreditCard, CheckCircle, XCircle, Clock, AlertTriangle, DollarSign, Package, User } from 'lucide-react'
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
    const hasWarned = useRef(false)

    // Countdown timer for confirmation
    useEffect(() => {
        if (!confirmExpiry || step !== 'details') return

        const updateTimer = () => {
            const expiryTime = new Date(confirmExpiry).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expiryTime - now) / 1000))
            setTimeLeft(diff)

            // Warning at 10 seconds
            if (diff <= 10 && diff > 0 && !hasWarned.current) {
                hasWarned.current = true
                toast.warning(inst.expiryWarning || '⚠️ سينتهي الوقت خلال 10 ثواني!')
            }

            // Auto-cancel when expired
            if (diff <= 0) {
                handleCancel(true)
            }
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
        hasWarned.current = false
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
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
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Package className="h-5 w-5 text-[#00A651]" />
                                    {inst.detailsTitle || 'تفاصيل القسط'}
                                </span>
                                {/* Timer */}
                                <span className={`flex items-center gap-1 text-sm font-medium ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-orange-500'
                                    }`}>
                                    <Clock className="h-4 w-4" />
                                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* beIN-style Contract Information - Full LTR Table */}
                            <div className="border border-[var(--color-border-default)] rounded-lg overflow-hidden" dir="ltr">
                                {/* Table Header */}
                                <div className="bg-[#00A651]/10 border-b border-[var(--color-border-default)] px-4 py-2 text-right">
                                    <span className="font-bold text-[#00A651] text-sm">Contract Information</span>
                                </div>

                                <table className="w-full text-sm border-collapse">
                                    <tbody>
                                        {/* Package Row */}
                                        <tr className="border-b border-[var(--color-border-default)]">
                                            <td className="px-3 py-2 font-bold" colSpan={3}>{installment.package}</td>
                                            <td className="px-3 py-2 bg-muted/30 text-sm font-medium text-muted-foreground text-right border-l border-[var(--color-border-default)] w-[130px]">:Package</td>
                                        </tr>

                                        {/* Months To Pay Row */}
                                        <tr className="border-b border-[var(--color-border-default)]">
                                            <td className="px-3 py-2" colSpan={3}>{installment.monthsToPay}</td>
                                            <td className="px-3 py-2 bg-muted/30 text-sm font-medium text-muted-foreground text-right border-l border-[var(--color-border-default)]">:Months To Pay</td>
                                        </tr>

                                        {/* Installment Amounts - IRD/IEC sub-table */}
                                        <tr className="border-b border-[var(--color-border-default)]">
                                            <td colSpan={4} className="p-0">
                                                <table className="w-full text-sm border-collapse">
                                                    <thead>
                                                        <tr className="bg-muted/20">
                                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-r border-[var(--color-border-default)] w-20"></th>
                                                            <th className="px-3 py-1.5 text-center font-medium text-muted-foreground border-b border-r border-[var(--color-border-default)]">Installment 1</th>
                                                            <th className="px-3 py-1.5 text-center font-medium text-muted-foreground border-b border-[var(--color-border-default)]">Installment 2</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr className="border-b border-[var(--color-border-default)]">
                                                            <td className="px-3 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)]">IRD</td>
                                                            <td className="px-3 py-1.5 text-center border-r border-[var(--color-border-default)]">
                                                                <span className="bg-[#0E4D4A] text-white px-2 py-0.5 rounded text-xs font-bold">{installment.installment1}</span>
                                                            </td>
                                                            <td className="px-3 py-1.5 text-center">
                                                                <span className="bg-[#0E4D4A] text-white px-2 py-0.5 rounded text-xs font-bold">{installment.installment1}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="px-3 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)]">IEC</td>
                                                            <td className="px-3 py-1.5 text-center border-r border-[var(--color-border-default)]">
                                                                <span className="bg-[#0E4D4A] text-white px-2 py-0.5 rounded text-xs font-bold">{installment.installment2}</span>
                                                            </td>
                                                            <td className="px-3 py-1.5 text-center">
                                                                <span className="bg-[#0E4D4A] text-white px-2 py-0.5 rounded text-xs font-bold">{installment.installment2}</span>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>

                                        {/* Dates & Prices Row */}
                                        <tr className="border-b border-[var(--color-border-default)]">
                                            <td className="px-3 py-1.5 bg-muted/30 text-xs font-medium text-muted-foreground whitespace-nowrap border-r border-[var(--color-border-default)]">Contract Start Date:</td>
                                            <td className="px-3 py-1.5 text-xs font-mono border-r border-[var(--color-border-default)]">{installment.contractStartDate || '-'}</td>
                                            <td className="px-3 py-1.5 bg-muted/30 text-xs font-medium text-muted-foreground whitespace-nowrap border-r border-[var(--color-border-default)]">Invoice Price (USD):</td>
                                            <td className="px-3 py-1.5 text-xs font-bold">{installment.invoicePrice}</td>
                                        </tr>
                                        <tr className="border-b border-[var(--color-border-default)]">
                                            <td className="px-3 py-1.5 bg-muted/30 text-xs font-medium text-muted-foreground whitespace-nowrap border-r border-[var(--color-border-default)]">Contract Expiry Date:</td>
                                            <td className="px-3 py-1.5 text-xs font-mono border-r border-[var(--color-border-default)]">{installment.contractExpiryDate || '-'}</td>
                                            <td className="px-3 py-1.5 bg-muted/30 text-xs font-medium text-muted-foreground whitespace-nowrap border-r border-[var(--color-border-default)]">Dealer Price (USD):</td>
                                            <td className="px-3 py-1.5 text-xs font-bold text-[#00A651]">{installment.dealerPrice}</td>
                                        </tr>

                                        {/* Subscriber Info Section */}
                                        <tr className="border-b border-[var(--color-border-default)]">
                                            <td colSpan={4} className="p-0">
                                                <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1 border-b border-[var(--color-border-default)]">
                                                    <User className="h-3 w-3" />
                                                    Subscriber Information
                                                </div>
                                                <table className="w-full text-xs border-collapse">
                                                    <tbody>
                                                        {/* Subscriber Name */}
                                                        <tr className="border-b border-[var(--color-border-default)]">
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground w-[120px] border-r border-[var(--color-border-default)] whitespace-nowrap">Subscriber Name:</td>
                                                            <td className="px-2 py-1.5" colSpan={3}>{subscriber?.name || '-'}</td>
                                                        </tr>
                                                        {/* Subscriber Email */}
                                                        <tr className="border-b border-[var(--color-border-default)]">
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">Subscriber Email:</td>
                                                            <td className="px-2 py-1.5" colSpan={3}>{subscriber?.email || '-'}</td>
                                                        </tr>
                                                        {/* Mobile | City */}
                                                        <tr className="border-b border-[var(--color-border-default)]">
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">Mobile:</td>
                                                            <td className="px-2 py-1.5 font-mono border-r border-[var(--color-border-default)]">{subscriber?.mobile || '-'}</td>
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">City:</td>
                                                            <td className="px-2 py-1.5">{subscriber?.city || '-'}</td>
                                                        </tr>
                                                        {/* Country */}
                                                        <tr className="border-b border-[var(--color-border-default)]">
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">Country:</td>
                                                            <td className="px-2 py-1.5" colSpan={3}>{subscriber?.country || '-'}</td>
                                                        </tr>
                                                        {/* Home Tel | Work Tel */}
                                                        <tr className="border-b border-[var(--color-border-default)]">
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">Home Tel:</td>
                                                            <td className="px-2 py-1.5 font-mono border-r border-[var(--color-border-default)]">{subscriber?.homeTel || '-'}</td>
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">Work Tel:</td>
                                                            <td className="px-2 py-1.5 font-mono">{subscriber?.workTel || '-'}</td>
                                                        </tr>
                                                        {/* Fax | STB Model */}
                                                        <tr className="border-b border-[var(--color-border-default)]">
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">Fax:</td>
                                                            <td className="px-2 py-1.5 font-mono border-r border-[var(--color-border-default)]">{subscriber?.fax || '-'}</td>
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap">STB Model:</td>
                                                            <td className="px-2 py-1.5 font-mono">{subscriber?.stbModel || '-'}</td>
                                                        </tr>
                                                        {/* Address | Remarks */}
                                                        <tr>
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap align-top">Address:</td>
                                                            <td className="px-2 py-1.5 border-r border-[var(--color-border-default)] align-top">{subscriber?.address || '-'}</td>
                                                            <td className="px-2 py-1.5 bg-muted/30 font-medium text-muted-foreground border-r border-[var(--color-border-default)] whitespace-nowrap align-top">Remarks:</td>
                                                            <td className="px-2 py-1.5 align-top">{subscriber?.remarks || '-'}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Payment Confirmation */}
                            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 space-y-3">
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-amber-800 dark:text-amber-200 mb-1">
                                        ⚠️ {inst.confirmTitle || 'تأكيد الدفع'}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {inst.confirmMessage || 'سيتم خصم المبلغ من رصيدك'}
                                    </p>
                                </div>
                                <div className="flex justify-between items-center bg-white dark:bg-gray-800 rounded-lg p-3">
                                    <span className="font-medium">{inst.dealerPrice || 'المبلغ المطلوب:'}</span>
                                    <span className="text-2xl font-bold text-[#00A651]">
                                        USD {installment.dealerPrice}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">{inst.yourBalance || 'رصيدك:'}</span>
                                    <span className={balance >= installment.dealerPrice ? 'text-green-600' : 'text-red-600'}>
                                        USD {balance}
                                    </span>
                                </div>
                            </div>

                            {/* Balance Warning */}
                            {balance < installment.dealerPrice && (
                                <div className="flex items-center gap-2 text-red-500 text-sm">
                                    <AlertTriangle className="h-4 w-4" />
                                    {inst.insufficientBalance || 'رصيد غير كافي'}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <Button
                                    onClick={handleConfirm}
                                    disabled={isConfirmLoading || balance < installment.dealerPrice}
                                    className="flex-1 bg-[#00A651] hover:bg-[#008f45]"
                                >
                                    {isConfirmLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4 ml-2" />
                                    )}
                                    {inst.payNow || 'ادفع الآن'}
                                </Button>
                                <Button
                                    onClick={() => handleCancel(false)}
                                    variant="outline"
                                    disabled={isConfirmLoading}
                                    className="flex-1"
                                >
                                    {inst.cancel || 'إلغاء'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
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
