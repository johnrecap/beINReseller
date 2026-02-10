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
    stbModel: string
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

            {/* Details Step - Show installment info with timer */}
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
                        <CardContent className="space-y-6">
                            {/* Package Info */}
                            <div className="bg-gradient-to-r from-[#00A651]/10 to-[#008f45]/10 border border-[#00A651]/30 rounded-xl p-4 space-y-3">
                                <div className="text-lg font-bold text-[#00A651]">
                                    {installment.package}
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">{inst.monthsToPay || 'الأقساط المستحقة:'}</span>
                                        <span className="font-medium mr-2">{installment.monthsToPay}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">{inst.installment1 || 'قسط 1:'}</span>
                                        <span className="font-medium mr-2">{installment.installment1} USD</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">{inst.startDate || 'بداية العقد:'}</span>
                                        <span className="font-medium mr-2">{installment.contractStartDate}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">{inst.expiryDate || 'نهاية العقد:'}</span>
                                        <span className="font-medium mr-2">{installment.contractExpiryDate}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Subscriber Info (if available) */}
                            {subscriber && subscriber.name && (
                                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                                        <User className="h-4 w-4" />
                                        {inst.subscriberInfo || 'معلومات المشترك'}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {subscriber.name && (
                                            <div>
                                                <span className="text-muted-foreground">{inst.name || 'الاسم:'}</span>
                                                <span className="mr-2">{subscriber.name}</span>
                                            </div>
                                        )}
                                        {subscriber.mobile && (
                                            <div>
                                                <span className="text-muted-foreground">{inst.mobile || 'الجوال:'}</span>
                                                <span className="mr-2">{subscriber.mobile}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Price Summary */}
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
                                        {installment.dealerPrice} USD
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">{inst.yourBalance || 'رصيدك:'}</span>
                                    <span className={balance >= installment.dealerPrice ? 'text-green-600' : 'text-red-600'}>
                                        {balance} USD
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
