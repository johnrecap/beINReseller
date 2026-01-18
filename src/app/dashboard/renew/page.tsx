'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBalance } from '@/hooks/useBalance'
import { Loader2, CheckCircle, XCircle, AlertCircle, CreditCard, Package, Lock, Sparkles, ShieldCheck, Clock, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/useTranslation'

// Types
type WizardStep = 'card-input' | 'processing' | 'captcha' | 'packages' | 'completing' | 'awaiting-final-confirm' | 'result'

interface AvailablePackage {
    index: number
    name: string
    price: number
    checkboxSelector: string
}

interface OperationResult {
    success: boolean
    message: string
}

// Step Indicator Component
function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
    const steps = [
        { id: 'card-input', label: 'رقم الكارت', icon: CreditCard },
        { id: 'packages', label: 'اختيار الباقة', icon: Package },
        { id: 'result', label: 'النتيجة', icon: CheckCircle },
    ]

    const getStepStatus = (stepId: string) => {
        const stepOrder = ['card-input', 'processing', 'captcha', 'packages', 'completing', 'awaiting-final-confirm', 'result']
        const currentIndex = stepOrder.indexOf(currentStep)

        if (stepId === 'card-input' && currentIndex > 0) return 'completed'
        if (stepId === 'packages' && (currentStep === 'completing' || currentStep === 'awaiting-final-confirm' || currentStep === 'result')) return 'completed'
        if (stepId === currentStep ||
            (stepId === 'packages' && (currentStep === 'processing' || currentStep === 'captcha' || currentStep === 'packages')) ||
            (stepId === 'result' && (currentStep === 'completing' || currentStep === 'awaiting-final-confirm' || currentStep === 'result'))) return 'current'
        return 'pending'
    }

    return (
        <div className="flex items-center justify-center mb-8">
            {steps.map((step, index) => {
                const status = getStepStatus(step.id)
                const Icon = step.icon
                return (
                    <div key={step.id} className="flex items-center">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            status === 'current' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                            }`}>
                            {status === 'completed' ? (
                                <CheckCircle className="h-5 w-5" />
                            ) : (
                                <Icon className="h-5 w-5" />
                            )}
                            <span className="font-medium text-sm hidden sm:inline">{step.label}</span>
                        </div>
                        {index < steps.length - 1 && (
                            <div className={`w-8 h-0.5 mx-2 ${status === 'completed' ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'
                                }`} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// Final Confirm Timer Component
function FinalConfirmTimer({
    expiry,
    onExpire,
    onWarning,
    warningThreshold = 10
}: {
    expiry: string
    onExpire?: () => void
    onWarning?: () => void
    warningThreshold?: number
}) {
    const [timeLeft, setTimeLeft] = useState<number>(0)
    const hasWarned = useRef(false)
    const hasExpired = useRef(false)

    useEffect(() => {
        // Reset refs when expiry changes
        hasWarned.current = false
        hasExpired.current = false
    }, [expiry])

    useEffect(() => {
        const updateTimer = () => {
            const expiryTime = new Date(expiry).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expiryTime - now) / 1000))
            setTimeLeft(diff)

            // Trigger warning callback when reaching threshold (only once)
            if (diff <= warningThreshold && diff > 0 && !hasWarned.current && onWarning) {
                hasWarned.current = true
                onWarning()
            }

            // Trigger expire callback when time is up (only once)
            if (diff <= 0 && !hasExpired.current && onExpire) {
                hasExpired.current = true
                onExpire()
            }
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
    }, [expiry, onExpire, onWarning, warningThreshold])

    if (timeLeft <= 0) {
        return (
            <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">انتهت المهلة!</span>
            </div>
        )
    }

    // Show warning style when nearing expiry
    const isWarning = timeLeft <= warningThreshold

    return (
        <div className={`flex items-center justify-center gap-2 ${isWarning ? 'text-red-600 dark:text-red-400 animate-pulse' : 'text-orange-600 dark:text-orange-400'}`}>
            <Clock className="h-4 w-4" />
            <span className={`text-sm ${isWarning ? 'font-bold' : ''}`}>
                الوقت المتبقي: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
        </div>
    )
}

export default function RenewWizardPage() {
    const { t } = useTranslation()
    const searchParams = useSearchParams()
    const { balance, refetch: refetchBalance } = useBalance()

    // State
    const [step, setStep] = useState<WizardStep>('card-input')
    const [cardNumber, setCardNumber] = useState('')
    const [operationId, setOperationId] = useState<string | null>(null)
    const [packages, setPackages] = useState<AvailablePackage[]>([])
    const [selectedPackageIndex, setSelectedPackageIndex] = useState<number | null>(null)
    const [promoCode, setPromoCode] = useState('')
    const [captchaImage, setCaptchaImage] = useState<string | null>(null)
    const [captchaSolution, setCaptchaSolution] = useState('')
    const [captchaSubmitted, setCaptchaSubmitted] = useState(false)  // Track if user already submitted CAPTCHA
    const [result, setResult] = useState<OperationResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [stbNumber, setStbNumber] = useState<string | null>(null)
    const [finalConfirmExpiry, setFinalConfirmExpiry] = useState<string | null>(null)  // For final confirm timer
    const [selectedPackageInfo, setSelectedPackageInfo] = useState<AvailablePackage | null>(null)  // For final confirm display
    const [isConfirmLoading, setIsConfirmLoading] = useState(false)
    const [showConfirmation, setShowConfirmation] = useState(false)  // Show price confirmation dialog
    const [showExpiryWarning, setShowExpiryWarning] = useState(false)  // Show warning before auto-cancel
    const [isAutoCancelling, setIsAutoCancelling] = useState(false)  // Prevent multiple auto-cancel calls

    // Check URL for existing operationId (for resuming operations)
    useEffect(() => {
        const urlOperationId = searchParams.get('operationId')
        if (urlOperationId && !operationId) {
            setOperationId(urlOperationId)
            setStep('processing') // Start polling immediately
        }
    }, [searchParams, operationId])

    // Poll for operation status
    const pollStatus = useCallback(async () => {
        if (!operationId) return

        try {
            const res = await fetch(`/api/operations/${operationId}/packages`)
            const data = await res.json()

            if (data.status === 'AWAITING_CAPTCHA') {
                // Only skip showing CAPTCHA if user already submitted a solution
                // (worker is still processing it)
                if (captchaSubmitted) {
                    // User already submitted CAPTCHA, worker is processing it
                    setTimeout(pollStatus, 2000)
                    return
                }

                // First time seeing CAPTCHA - show it
                const captchaRes = await fetch(`/api/operations/${operationId}/captcha`)
                const captchaData = await captchaRes.json()
                if (captchaData.captchaImage) {
                    setCaptchaImage(captchaData.captchaImage)
                    setStep('captcha')
                }
            } else if (data.status === 'AWAITING_PACKAGE') {
                // Packages ready
                setPackages(data.packages || [])
                setStbNumber(data.stbNumber)
                setStep('packages')
            } else if (data.status === 'COMPLETED') {
                setResult({ success: true, message: data.message || 'تم التجديد بنجاح!' })
                setStep('result')
                refetchBalance()
            } else if (data.status === 'FAILED') {
                setResult({ success: false, message: data.message || 'فشلت العملية' })
                setStep('result')
            } else if (data.status === 'AWAITING_FINAL_CONFIRM') {
                // Show final confirmation dialog
                setSelectedPackageInfo(data.selectedPackage || null)
                setStbNumber(data.stbNumber || null)
                setFinalConfirmExpiry(data.finalConfirmExpiry || null)
                setStep('awaiting-final-confirm')
            } else if (data.status === 'PENDING' || data.status === 'PROCESSING' || data.status === 'COMPLETING') {
                // Still processing, continue polling
                setTimeout(pollStatus, 2000)
            }
        } catch (error) {
            console.error('Poll error:', error)
            setTimeout(pollStatus, 3000)
        }
    }, [operationId, refetchBalance, captchaSubmitted])

    useEffect(() => {
        if (step === 'processing' || step === 'completing') {
            const timeoutId = setTimeout(pollStatus, 2000)
            return () => clearTimeout(timeoutId)
        }
    }, [step, pollStatus])

    // Handle final confirmation
    const handleFinalConfirm = async () => {
        if (!operationId) return

        setIsConfirmLoading(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/confirm-purchase`, { method: 'POST' })
            const data = await res.json()

            if (res.ok) {
                setStep('completing')
                toast.success('جاري إتمام الشراء النهائي...')
            } else {
                toast.error(data.error || 'فشل في تأكيد الدفع')
            }
        } catch {
            toast.error('حدث خطأ في الاتصال')
        } finally {
            setIsConfirmLoading(false)
        }
    }

    // Handle cancel confirmation (manual or auto)
    const handleCancelConfirm = async (isAutoCancel = false) => {
        if (!operationId) return
        if (isAutoCancelling) return  // Prevent double calls

        if (isAutoCancel) {
            setIsAutoCancelling(true)
        }
        setIsConfirmLoading(true)

        try {
            const res = await fetch(`/api/operations/${operationId}/cancel-confirm`, { method: 'POST' })
            const data = await res.json()

            if (res.ok) {
                const message = isAutoCancel
                    ? 'تم إلغاء العملية تلقائياً لانتهاء المهلة واسترداد المبلغ'
                    : 'تم إلغاء العملية واسترداد المبلغ'
                setResult({ success: false, message })
                setStep('result')
                refetchBalance()
                toast.info(message)
            } else {
                toast.error(data.error || 'فشل في إلغاء العملية')
            }
        } catch {
            toast.error('حدث خطأ في الاتصال')
        } finally {
            setIsConfirmLoading(false)
            setIsAutoCancelling(false)
            setShowExpiryWarning(false)
        }
    }

    // Handle expiry warning (10 seconds before auto-cancel)
    const handleExpiryWarning = useCallback(() => {
        setShowExpiryWarning(true)
        toast.warning('⚠️ سيتم إلغاء العملية تلقائياً خلال 10 ثواني!', {
            duration: 10000,
        })
    }, [])

    // Handle auto-cancel when timer expires
    const handleAutoExpire = useCallback(() => {
        if (!isAutoCancelling && step === 'awaiting-final-confirm') {
            handleCancelConfirm(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAutoCancelling, step])

    // Start renewal
    const handleStartRenewal = async () => {
        if (cardNumber.length < 10) {
            toast.error('رقم الكارت يجب أن يكون 10 أرقام على الأقل')
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/operations/start-renewal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardNumber }),
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'حدث خطأ')
                return
            }

            setOperationId(data.operationId)
            setStep('processing')
            toast.success('جاري بدء العملية...')
        } catch {
            toast.error('حدث خطأ في الاتصال')
        } finally {
            setLoading(false)
        }
    }

    // Submit captcha
    const handleSubmitCaptcha = async () => {
        if (!captchaSolution || !operationId) return

        setLoading(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/captcha`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ solution: captchaSolution }),
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'الكابتشا غير صحيحة')
                return
            }

            setCaptchaSolution('')
            setCaptchaSubmitted(true)  // Mark that we submitted CAPTCHA
            setStep('processing')
            toast.success('جاري تحميل الباقات...')
        } catch {
            toast.error('حدث خطأ')
        } finally {
            setLoading(false)
        }
    }

    // Select package
    const handleSelectPackage = async () => {
        if (selectedPackageIndex === null || !operationId) return

        const selectedPkg = packages.find(p => p.index === selectedPackageIndex)
        if (!selectedPkg) return

        if (balance < selectedPkg.price) {
            toast.error('رصيد غير كافي')
            return
        }

        setLoading(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/select-package`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    packageIndex: selectedPackageIndex,
                    promoCode: promoCode || undefined,
                }),
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'حدث خطأ')
                return
            }

            setStep('completing')
            refetchBalance()
            toast.success('جاري إتمام الشراء...')
        } catch {
            toast.error('حدث خطأ')
        } finally {
            setLoading(false)
        }
    }

    // Apply promo code and refresh packages
    const handleApplyPromo = async () => {
        if (!operationId || !promoCode) return

        setLoading(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/apply-promo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ promoCode }),
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'فشل تطبيق الكود')
                return
            }

            // Update packages with new prices
            if (data.packages && data.packages.length > 0) {
                setPackages(data.packages)
                setSelectedPackageIndex(null) // Reset selection
                toast.success('تم تطبيق الكود! الأسعار محدثة')
            } else {
                toast.warning('تم تطبيق الكود لكن الباقات لم تتغير')
            }
        } catch {
            toast.error('حدث خطأ في تطبيق الكود')
        } finally {
            setLoading(false)
        }
    }

    // Reset wizard
    const handleReset = () => {
        setStep('card-input')
        setCardNumber('')
        setOperationId(null)
        setPackages([])
        setSelectedPackageIndex(null)
        setPromoCode('')
        setCaptchaImage(null)
        setCaptchaSolution('')
        setCaptchaSubmitted(false)  // Reset CAPTCHA submitted state
        setShowConfirmation(false)  // Reset confirmation dialog
        setResult(null)
        setStbNumber(null)
        setFinalConfirmExpiry(null)
        setSelectedPackageInfo(null)
        setShowExpiryWarning(false)  // Reset expiry warning
        setIsAutoCancelling(false)  // Reset auto-cancelling flag
    }

    return (
        <div className="container max-w-2xl mx-auto py-8 px-4">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
                    {(t.renew as any)?.title || 'تجديد اشتراك beIN'}
                </h1>
                <p className="text-muted-foreground mt-2">{(t.renew as any)?.subtitle || 'اختر الباقة المناسبة لك'}</p>
            </div>

            <StepIndicator currentStep={step} />

            {/* Step 1: Card Input */}
            {step === 'card-input' && (
                <Card className="border-2 border-purple-100 dark:border-purple-900/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-purple-500" />
                            {(t.renew as any)?.cardInput?.title || 'أدخل رقم الكارت'}
                        </CardTitle>
                        <CardDescription>{(t.renew as any)?.cardInput?.description || 'أدخل رقم كارت beIN المكون من 10-16 رقم'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="cardNumber">{(t.renew as any)?.cardInput?.label || 'رقم الكارت'}</Label>
                            <Input
                                id="cardNumber"
                                type="text"
                                value={cardNumber}
                                onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                                placeholder="7517663273"
                                className="mt-2 text-left font-mono text-lg tracking-wider"
                                dir="ltr"
                            />
                            {cardNumber && cardNumber.length < 10 && (
                                <p className="text-xs text-red-500 mt-1">{(t.renew as any)?.cardInput?.error || 'رقم الكارت يجب أن يكون 10 أرقام على الأقل'}</p>
                            )}
                        </div>
                        <Button
                            onClick={handleStartRenewal}
                            disabled={cardNumber.length < 10 || loading}
                            className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                    {(t.renew as any)?.cardInput?.loading || 'جاري البدء...'}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 ml-2" />
                                    {(t.renew as any)?.cardInput?.button || 'بدء التجديد'}
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Processing State */}
            {step === 'processing' && (
                <Card className="border-2 border-blue-100 dark:border-blue-900/30">
                    <CardContent className="py-12 text-center">
                        <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2">{(t.renew as any)?.processing?.title || 'جاري المعالجة...'}</h3>
                        <p className="text-muted-foreground">{(t.renew as any)?.processing?.description || 'يتم الاتصال بـ beIN واستخراج الباقات المتاحة'}</p>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Captcha */}
            {step === 'captcha' && (
                <Card className="border-2 border-amber-100 dark:border-amber-900/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5 text-amber-500" />
                            {(t.renew as any)?.captcha?.title || 'حل الكابتشا'}
                        </CardTitle>
                        <CardDescription>{(t.renew as any)?.captcha?.description || 'أدخل الحروف الظاهرة في الصورة'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {captchaImage && (
                            <div className="flex justify-center">
                                <img
                                    src={captchaImage.startsWith('data:') ? captchaImage : `data:image/png;base64,${captchaImage}`}
                                    alt="Captcha"
                                    className="border rounded-lg"
                                />
                            </div>
                        )}
                        <div>
                            <Label htmlFor="captcha">{(t.renew as any)?.captcha?.label || 'الحل'}</Label>
                            <Input
                                id="captcha"
                                type="text"
                                value={captchaSolution}
                                onChange={(e) => setCaptchaSolution(e.target.value)}
                                placeholder="ABCD"
                                className="mt-2 text-center font-mono text-xl tracking-widest"
                                dir="ltr"
                            />
                        </div>
                        <Button
                            onClick={handleSubmitCaptcha}
                            disabled={!captchaSolution || loading}
                            className="w-full"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                    {(t.renew as any)?.captcha?.loading || 'جاري التحقق...'}
                                </>
                            ) : (
                                (t.renew as any)?.captcha?.button || 'إرسال'
                            )}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Package Selection */}
            {step === 'packages' && (
                <Card className="border-2 border-green-100 dark:border-green-900/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-green-500" />
                            {(t.renew as any)?.packages?.title || 'اختر الباقة'}
                        </CardTitle>
                        <CardDescription>
                            {stbNumber && <span>{(t.renew as any)?.packages?.receiverNumber || 'رقم الريسيفر:'} <strong dir="ltr">{stbNumber}</strong></span>}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {packages.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                                {(t.renew as any)?.packages?.noPackages || 'لا توجد باقات متاحة لهذا الكارت'}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {packages.map((pkg) => (
                                    <div
                                        key={pkg.index}
                                        onClick={() => setSelectedPackageIndex(pkg.index)}
                                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedPackageIndex === pkg.index
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <div className="font-bold">{pkg.name}</div>
                                            </div>
                                            <div className="text-lg font-bold text-purple-600">
                                                {pkg.price} USD
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {packages.length > 0 && (
                            <>
                                <div>
                                    <Label htmlFor="promoCode">{(t.renew as any)?.packages?.promoLabel || 'كود الخصم (اختياري)'}</Label>
                                    <div className="flex gap-2 mt-2">
                                        <Input
                                            id="promoCode"
                                            type="text"
                                            value={promoCode}
                                            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                            placeholder="SAVE20"
                                            dir="ltr"
                                            className="flex-1"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handleApplyPromo}
                                            disabled={!promoCode || loading}
                                            className="shrink-0"
                                        >
                                            {loading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                (t.renew as any)?.packages?.applyPromo || 'تطبيق'
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                                    <div className="flex justify-between text-sm">
                                        <span>{(t.renew as any)?.packages?.currentBalance || 'رصيدك الحالي:'}</span>
                                        <span className={balance >= (packages.find(p => p.index === selectedPackageIndex)?.price || 0) ? 'text-green-600' : 'text-red-600'}>
                                            {balance} USD
                                        </span>
                                    </div>
                                </div>

                                {/* Show confirmation only when package is selected */}
                                {selectedPackageIndex !== null && !showConfirmation && (
                                    <Button
                                        onClick={() => setShowConfirmation(true)}
                                        disabled={loading}
                                        className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                                    >
                                        {(t.renew as any)?.packages?.showDetails || 'عرض التفاصيل والموافقة'}
                                    </Button>
                                )}

                                {/* Confirmation Dialog */}
                                {showConfirmation && selectedPackageIndex !== null && (
                                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-6 space-y-4">
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-amber-800 dark:text-amber-200 mb-2">
                                                ⚠️ {(t.renew as any)?.packages?.confirmTitle || 'تأكيد الشراء'}
                                            </h3>
                                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                                {(t.renew as any)?.packages?.confirmMessage || 'يرجى مراجعة التفاصيل قبل المتابعة'}
                                            </p>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-600 dark:text-gray-400">{(t.renew as any)?.packages?.selectedPackage || 'الباقة المختارة:'}</span>
                                                <span className="font-bold text-lg">
                                                    {packages.find(p => p.index === selectedPackageIndex)?.name}
                                                </span>
                                            </div>
                                            <hr className="border-gray-200 dark:border-gray-700" />
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-600 dark:text-gray-400">{(t.renew as any)?.packages?.totalAmount || 'المبلغ الإجمالي:'}</span>
                                                <span className="font-bold text-2xl text-green-600 dark:text-green-400">
                                                    {packages.find(p => p.index === selectedPackageIndex)?.price} USD
                                                </span>
                                            </div>
                                            {promoCode && (
                                                <>
                                                    <hr className="border-gray-200 dark:border-gray-700" />
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600 dark:text-gray-400">{(t.renew as any)?.packages?.promoApplied || 'كود الخصم:'}</span>
                                                        <span className="font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                                                            {promoCode}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="flex gap-3">
                                            <Button
                                                variant="outline"
                                                onClick={() => setShowConfirmation(false)}
                                                disabled={loading}
                                                className="flex-1"
                                            >
                                                {(t.renew as any)?.packages?.editChoice || 'تعديل الاختيار'}
                                            </Button>
                                            <Button
                                                onClick={handleSelectPackage}
                                                disabled={loading}
                                                className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600"
                                            >
                                                {loading ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                                        {(t.renew as any)?.packages?.purchasing || 'جاري الشراء...'}
                                                    </>
                                                ) : (
                                                    '✓ ' + ((t.renew as any)?.packages?.confirmPurchase || 'موافق - إتمام الشراء')
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Completing State */}
            {step === 'completing' && (
                <Card className="border-2 border-purple-100 dark:border-purple-900/30">
                    <CardContent className="py-12 text-center">
                        <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2">{(t.renew as any)?.completing?.title || 'جاري إتمام الشراء...'}</h3>
                        <p className="text-muted-foreground">{(t.renew as any)?.completing?.warning || 'لا تغلق الصفحة'}</p>
                    </CardContent>
                </Card>
            )}

            {/* Step: Awaiting Final Confirm */}
            {step === 'awaiting-final-confirm' && (
                <Card className="border-2 border-orange-200 dark:border-orange-900/30">
                    <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="h-8 w-8" />
                            <div>
                                <CardTitle className="text-white text-xl">{(t.renew as any)?.finalConfirm?.title || 'تأكيد الدفع النهائي'}</CardTitle>
                                <CardDescription className="text-orange-100">{(t.renew as any)?.finalConfirm?.description || 'هذه الخطوة الأخيرة قبل إتمام الشراء'}</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        {/* Package Info */}
                        <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">{(t.renew as any)?.finalConfirm?.package || 'الباقة:'}</span>
                                <span className="font-bold text-foreground">{selectedPackageInfo?.name || 'غير محدد'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">{(t.renew as any)?.finalConfirm?.price || 'السعر:'}</span>
                                <span className="font-bold text-green-600 dark:text-green-400">{selectedPackageInfo?.price || 0} USD</span>
                            </div>
                            {stbNumber && (
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">{(t.renew as any)?.finalConfirm?.receiver || 'رقم الريسيفر:'}</span>
                                    <span className="font-mono text-sm" dir="ltr">{stbNumber}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">{(t.renew as any)?.finalConfirm?.cardNumber || 'رقم الكارت:'}</span>
                                <span className="font-mono text-sm" dir="ltr">****{cardNumber.slice(-4)}</span>
                            </div>
                        </div>

                        {/* Timer */}
                        {finalConfirmExpiry && (
                            <FinalConfirmTimer
                                expiry={finalConfirmExpiry}
                                onWarning={handleExpiryWarning}
                                onExpire={handleAutoExpire}
                            />
                        )}

                        {/* Expiry Warning Message */}
                        {showExpiryWarning && (
                            <div className="flex items-center justify-center gap-2 p-3 bg-red-100 dark:bg-red-900/40 rounded-xl border-2 border-red-400 dark:border-red-600 animate-pulse">
                                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                <span className="text-sm font-bold text-red-700 dark:text-red-300">
                                    ⚠️ {(t.renew as any)?.finalConfirm?.warning || 'سيتم إلغاء العملية تلقائياً!'}
                                </span>
                            </div>
                        )}

                        {/* Warning */}
                        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 dark:text-red-300">
                                <strong>تحذير:</strong> عند الضغط على &quot;تأكيد الدفع&quot;، سيتم إتمام عملية الشراء ولن يمكن إلغاؤها أو استردادها.
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => handleCancelConfirm(false)}
                                disabled={isConfirmLoading || isAutoCancelling}
                                className="flex-1"
                            >
                                {(t.renew as any)?.finalConfirm?.cancel || 'إلغاء'}
                            </Button>
                            <Button
                                onClick={handleFinalConfirm}
                                disabled={isConfirmLoading || isAutoCancelling}
                                className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                            >
                                {isConfirmLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                        {(t.renew as any)?.finalConfirm?.confirming || 'جاري التأكيد...'}
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-4 w-4 ml-2" />
                                        {(t.renew as any)?.finalConfirm?.confirm || 'تأكيد الدفع'}
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 4: Result */}
            {step === 'result' && result && (
                <Card className={`border-2 ${result.success ? 'border-green-200 dark:border-green-900/30' : 'border-red-200 dark:border-red-900/30'}`}>
                    <CardContent className="py-12 text-center">
                        {result.success ? (
                            <>
                                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-green-600 mb-2">{(t.renew as any)?.result?.success || 'تم بنجاح!'}</h3>
                            </>
                        ) : (
                            <>
                                <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-red-600 mb-2">{(t.renew as any)?.result?.failed || 'فشلت العملية'}</h3>
                            </>
                        )}
                        <p className="text-muted-foreground mb-6">{result.message}</p>
                        <Button onClick={handleReset} variant="outline" className="gap-2">
                            <Sparkles className="h-4 w-4" />
                            {(t.renew as any)?.result?.newOperation || 'عملية جديدة'}
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
