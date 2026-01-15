'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBalance } from '@/hooks/useBalance'
import { Loader2, CheckCircle, XCircle, AlertCircle, CreditCard, Package, Lock, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

// Types
type WizardStep = 'card-input' | 'processing' | 'captcha' | 'packages' | 'completing' | 'result'

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
        const stepOrder = ['card-input', 'processing', 'captcha', 'packages', 'completing', 'result']
        const currentIndex = stepOrder.indexOf(currentStep)

        if (stepId === 'card-input' && currentIndex > 0) return 'completed'
        if (stepId === 'packages' && (currentStep === 'completing' || currentStep === 'result')) return 'completed'
        if (stepId === currentStep ||
            (stepId === 'packages' && (currentStep === 'processing' || currentStep === 'captcha' || currentStep === 'packages')) ||
            (stepId === 'result' && (currentStep === 'completing' || currentStep === 'result'))) return 'current'
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

export default function RenewWizardPage() {
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
    const [result, setResult] = useState<OperationResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [stbNumber, setStbNumber] = useState<string | null>(null)

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
                // Need captcha
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
            } else if (data.status === 'PENDING' || data.status === 'PROCESSING' || data.status === 'COMPLETING') {
                // Still processing, continue polling
                setTimeout(pollStatus, 2000)
            }
        } catch (error) {
            console.error('Poll error:', error)
            setTimeout(pollStatus, 3000)
        }
    }, [operationId, refetchBalance])

    useEffect(() => {
        if (step === 'processing' || step === 'completing') {
            const timeoutId = setTimeout(pollStatus, 2000)
            return () => clearTimeout(timeoutId)
        }
    }, [step, pollStatus])

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
        setResult(null)
        setStbNumber(null)
    }

    return (
        <div className="container max-w-2xl mx-auto py-8 px-4">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
                    تجديد اشتراك beIN
                </h1>
                <p className="text-muted-foreground mt-2">اختر الباقة المناسبة لك</p>
            </div>

            <StepIndicator currentStep={step} />

            {/* Step 1: Card Input */}
            {step === 'card-input' && (
                <Card className="border-2 border-purple-100 dark:border-purple-900/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-purple-500" />
                            أدخل رقم الكارت
                        </CardTitle>
                        <CardDescription>أدخل رقم كارت beIN المكون من 10-16 رقم</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="cardNumber">رقم الكارت</Label>
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
                                <p className="text-xs text-red-500 mt-1">رقم الكارت يجب أن يكون 10 أرقام على الأقل</p>
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
                                    جاري البدء...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 ml-2" />
                                    بدء التجديد
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
                        <h3 className="text-xl font-semibold mb-2">جاري المعالجة...</h3>
                        <p className="text-muted-foreground">يتم الاتصال بـ beIN واستخراج الباقات المتاحة</p>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Captcha */}
            {step === 'captcha' && (
                <Card className="border-2 border-amber-100 dark:border-amber-900/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5 text-amber-500" />
                            حل الكابتشا
                        </CardTitle>
                        <CardDescription>أدخل الحروف الظاهرة في الصورة</CardDescription>
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
                            <Label htmlFor="captcha">الحل</Label>
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
                                    جاري التحقق...
                                </>
                            ) : (
                                'إرسال'
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
                            اختر الباقة
                        </CardTitle>
                        <CardDescription>
                            {stbNumber && <span>رقم الريسيفر: <strong dir="ltr">{stbNumber}</strong></span>}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {packages.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                                لا توجد باقات متاحة لهذا الكارت
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
                                    <Label htmlFor="promoCode">كود الخصم (اختياري)</Label>
                                    <Input
                                        id="promoCode"
                                        type="text"
                                        value={promoCode}
                                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                        placeholder="SAVE20"
                                        className="mt-2"
                                        dir="ltr"
                                    />
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                                    <div className="flex justify-between text-sm">
                                        <span>رصيدك الحالي:</span>
                                        <span className={balance >= (packages.find(p => p.index === selectedPackageIndex)?.price || 0) ? 'text-green-600' : 'text-red-600'}>
                                            {balance} USD
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleSelectPackage}
                                    disabled={selectedPackageIndex === null || loading}
                                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                            جاري الشراء...
                                        </>
                                    ) : (
                                        'إتمام الشراء'
                                    )}
                                </Button>
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
                        <h3 className="text-xl font-semibold mb-2">جاري إتمام الشراء...</h3>
                        <p className="text-muted-foreground">لا تغلق الصفحة</p>
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
                                <h3 className="text-2xl font-bold text-green-600 mb-2">تم بنجاح!</h3>
                            </>
                        ) : (
                            <>
                                <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-red-600 mb-2">فشلت العملية</h3>
                            </>
                        )}
                        <p className="text-muted-foreground mb-6">{result.message}</p>
                        <Button onClick={handleReset} variant="outline" className="gap-2">
                            <Sparkles className="h-4 w-4" />
                            عملية جديدة
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
