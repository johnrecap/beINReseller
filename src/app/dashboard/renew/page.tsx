'use client'

import { withRequestDeadline } from '@/lib/request-deadline'


import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useBalance } from '@/hooks/useBalance'
import { useMaintenance } from '@/hooks/useMaintenance'
import { useOperationHeartbeat } from '@/hooks/useOperationHeartbeat'
import { Loader2, CheckCircle, XCircle, AlertCircle, CreditCard, Package, Lock, Sparkles, ShieldCheck, Clock, AlertTriangle, Code } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import MaintenanceOverlay from '@/components/shared/MaintenanceOverlay'
import { SignalRefreshFlow, InstallmentPaymentFlow } from '@/components/renewal'
import { Zap } from 'lucide-react'
import { requestPrePayOperationExpiry } from '@/lib/operations/client-timeout'
import { OPERATION_WARNING_THRESHOLD_SECONDS } from '@/lib/operations/timing'
import { useTranslation } from '@/hooks/useTranslation'
import { useRenewalCardCooldown } from '@/hooks/useRenewalCardCooldown'
import { CardCooldownNotice } from '@/components/renewal/CardCooldownNotice'

// Renewal Mode Type
type RenewalMode = 'signal-refresh' | 'package-renewal' | 'installment'
type SmartcardType = 'CISCO' | 'IRDETO'
type WizardStep = 'card-input' | 'processing' | 'captcha' | 'packages' | 'completing' | 'awaiting-final-confirm' | 'result'

interface AvailablePackage {
    index: number
    name: string
    price: number
    currency?: string
    quoteRevision: number
    packageKey: string
    appliedPromoCode?: string | null
}

interface OperationResult {
    success: boolean
    pending?: 'reviewRequired' | 'pendingSettlement'
    message: (t: ReturnType<typeof useTranslation>['t']) => string
}

// Step Indicator Component
function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
    const { t } = useTranslation()
    const steps = [
        { id: 'card-input', label: t.renew.steps.cardInput, icon: CreditCard },
        { id: 'packages', label: t.renew.steps.selectPackage, icon: Package },
        { id: 'result', label: t.renew.steps.result, icon: ShieldCheck },
    ]

    const getStepStatus = (stepId: string) => {
        const stepOrder = ['card-input', 'processing', 'captcha', 'packages', 'completing', 'awaiting-final-confirm', 'result']
        const currentIndex = stepOrder.indexOf(currentStep)

        // Special handling for the steps mapping
        if (stepId === 'card-input') {
            return currentIndex > 0 ? 'completed' : 'current'
        }
        if (stepId === 'packages') {
            if (currentIndex > stepOrder.indexOf('packages')) return 'completed'
            if (currentIndex >= stepOrder.indexOf('processing')) return 'current'
            return 'pending'
        }
        if (stepId === 'result') {
            if (currentStep === 'result' || currentStep === 'completing' || currentStep === 'awaiting-final-confirm') return 'current'
            return 'pending'
        }
        return 'pending'
    }

    return (
        <div className="w-full max-w-md mx-auto mb-10 px-4">
            <div className="relative flex justify-between items-center">
                {/* Connecting Lines Layer */}
                <div className="absolute top-[18px] left-0 w-full h-[2px] bg-[var(--color-border-default)] -z-10">
                    <div
                        className="h-full bg-[#00A651] transition-all duration-500 ease-in-out"
                        style={{
                            width: currentStep === 'card-input' ? '0%' :
                                (currentStep === 'processing' || currentStep === 'captcha') ? '25%' :
                                    currentStep === 'packages' ? '50%' :
                                        (currentStep === 'completing' || currentStep === 'awaiting-final-confirm') ? '75%' :
                                            '100%'
                        }}
                    />
                </div>

                {steps.map((step) => {
                    const status = getStepStatus(step.id)
                    const isActive = status === 'current'
                    const isCompleted = status === 'completed'
                    const Icon = isCompleted ? CheckCircle : step.icon

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2">
                            <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10 ${isCompleted
                                    ? 'bg-[#22c55e] border-[#22c55e] text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                                    : isActive
                                        ? 'bg-white dark:bg-[#0f172a] border-[#00A651] text-[#00A651] shadow-[0_0_15px_rgba(0,166,81,0.4)] scale-110'
                                        : 'bg-[var(--color-bg-card)] border-[var(--color-border-default)] text-[var(--color-text-muted)]'
                                    }`}
                            >
                                <Icon className={`w-4 h-4 ${isCompleted ? 'animate-in zoom-in' : ''}`} />
                            </div>
                            <span className={`text-xs font-medium transition-colors duration-300 ${isActive || isCompleted ? 'text-foreground font-bold' : 'text-muted-foreground'
                                }`}>
                                {step.label}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// Final Confirm Timer Component
function FinalConfirmTimer({
    expiry,
    onExpire,
    onWarning,
    warningThreshold = OPERATION_WARNING_THRESHOLD_SECONDS
}: {
    expiry: string
    onExpire?: () => void
    onWarning?: () => void
    warningThreshold?: number
}) {
    const { t } = useTranslation()
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
                <span className="text-sm font-medium">{t.renew.timer.expired}</span>
            </div>
        )
    }

    // Show warning style when nearing expiry
    const isWarning = timeLeft <= warningThreshold

    return (
        <div className={`flex items-center justify-center gap-2 ${isWarning ? 'text-red-600 dark:text-red-400 animate-pulse' : 'text-orange-600 dark:text-orange-400'}`}>
            <Clock className="h-4 w-4" />
            <span className={`text-sm ${isWarning ? 'font-bold' : ''}`}>
                {t.renew.timer.remaining} {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
        </div>
    )
}

export default function RenewWizardPage() {
    const { data: session } = useSession()
    const { t } = useTranslation()
    const isAdmin = session?.user?.role === 'ADMIN'
    const searchParams = useSearchParams()
    const { balance, refetch: refetchBalance } = useBalance()
    const { isMaintenanceMode, maintenanceMessage, maintenancePauseUntil, isLoading: isMaintenanceLoading, isInstallmentDevMode } = useMaintenance()

    // State
    const [renewalMode, setRenewalMode] = useState<RenewalMode>('package-renewal')
    const [smartcardType, setSmartcardType] = useState<SmartcardType>('CISCO')
    const [step, setStep] = useState<WizardStep>('card-input')
    const [cardNumber, setCardNumber] = useState('')
    const [operationId, setOperationId] = useState<string | null>(null)
    const [packages, setPackages] = useState<AvailablePackage[]>([])
    const [selectedPackageIndex, setSelectedPackageIndex] = useState<number | null>(null)
    const [promoCode, setPromoCode] = useState('')
    const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null)
    const [quoteRevision, setQuoteRevision] = useState(0)
    const [quoteState, setQuoteState] = useState<'PENDING' | 'READY' | 'FAILED'>('PENDING')
    const [quotePollStopped, setQuotePollStopped] = useState(false)
    const quoteRef = useRef({ operationId: '', revision: -1, state: 'PENDING' })
    const promoRequestRef = useRef<{ operationId: string; actionRevision: number; promoAction: 'APPLY' | 'REMOVE'; promoCode?: string } | null>(null)
    const operationRef = useRef(operationId)
    operationRef.current = operationId
    const [captchaImage, setCaptchaImage] = useState<string | null>(null)
    const [captchaSolution, setCaptchaSolution] = useState('')
    const [captchaSubmitted, setCaptchaSubmitted] = useState(false)  // Track if user already submitted CAPTCHA
    const [result, setResult] = useState<OperationResult | null>(null)
    const [fulfillmentStatusMessage, setFulfillmentStatusMessage] = useState<boolean>(false)
    const [loading, setLoading] = useState(false)
    const [stbNumber, setStbNumber] = useState<string | null>(null)
    const [finalConfirmExpiry, setFinalConfirmExpiry] = useState<string | null>(null)  // For final confirm timer
    const [selectedPackageInfo, setSelectedPackageInfo] = useState<AvailablePackage | null>(null)  // For final confirm display
    const [isConfirmLoading, setIsConfirmLoading] = useState(false)
    const [showConfirmation, setShowConfirmation] = useState(false)  // Show price confirmation dialog
    const [showExpiryWarning, setShowExpiryWarning] = useState(false)  // Show warning before auto-cancel
    const [isAutoCancelling, setIsAutoCancelling] = useState(false)  // Prevent multiple auto-cancel calls
    const pollStartTimeRef = useRef<number>(0)  // Track when polling started for adaptive intervals
    const pollErrorCountRef = useRef<number>(0)
    const statusPollGeneration = useRef(0)
    const statusPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const startRenewalInFlightRef = useRef(false)
    const MAX_POLL_ERROR_RETRIES = 5
    const { remainingSeconds: cardCooldownSeconds, acceptCooldown } = useRenewalCardCooldown(
        cardNumber, renewalMode === 'package-renewal' && (step === 'card-input' || step === 'result'), step)

    const consumeQuote = useCallback((id: string, data: { quoteRevision?: number; quoteState?: string; packages?: AvailablePackage[]; appliedPromoCode?: string | null }) => {
        if (operationRef.current !== id || !Number.isInteger(data.quoteRevision) ||
            !['PENDING', 'READY', 'FAILED'].includes(data.quoteState || '')) return false
        const previous = quoteRef.current
        const revision = data.quoteRevision as number
        if (previous.operationId === id && (revision < previous.revision ||
            (revision === previous.revision && previous.state !== 'PENDING' && data.quoteState === 'PENDING'))) return false
        if (previous.operationId !== id || revision !== previous.revision || data.quoteState !== previous.state) {
            setSelectedPackageIndex(null)
            setShowConfirmation(false)
        }
        quoteRef.current = { operationId: id, revision, state: data.quoteState! }
        setQuoteRevision(revision)
        setQuoteState(data.quoteState as 'PENDING' | 'READY' | 'FAILED')
        setPackages(data.packages || [])
        setAppliedPromoCode(data.appliedPromoCode || null)
        if (data.quoteState !== 'PENDING') {
            promoRequestRef.current = null
            setQuotePollStopped(false)
        }
        return true
    }, [])

    const quoteErrorMessage = (data: { messageKey?: string; error?: string }) => {
        const key = data.messageKey?.replace('operations.', '')
        return key && key in t.operations ? t.operations[key as keyof typeof t.operations] : t.operations.packageQuoteFailed
    }

    // Set dynamic page title
    useEffect(() => {
        document.title = `${t.renew.title} | Desh Panel`
    }, [t.renew.title])

    // Heartbeat system - keeps operation alive while user is on page
    // If heartbeats stop (browser close, tab close), operation will be auto-cancelled
    const shouldSendHeartbeat = operationId !== null &&
        ['packages', 'captcha', 'awaiting-final-confirm'].includes(step)

    useOperationHeartbeat({
        operationId,
        enabled: shouldSendHeartbeat,
        onExpired: () => {
            // Operation was expired by cleanup cron
            setResult({ success: false, message: t => t.renew.feedback.expired })
            setStep('result')
            refetchBalance()
        },
    })

    // Check URL for existing operationId (for resuming operations)
    useEffect(() => {
        const urlOperationId = searchParams.get('operationId')
        if (urlOperationId && !operationId) {
            setOperationId(urlOperationId)
            setStep('processing') // Start polling immediately
        }
    }, [searchParams, operationId])

    // Poll for operation status — adaptive intervals for fast response
    const pollStatus = useCallback(async () => {
        if (!operationId) return
        const generation = statusPollGeneration.current

        // Adaptive interval: fast at start, slow down over time
        const getNextInterval = () => {
            const elapsed = Date.now() - pollStartTimeRef.current
            if (elapsed < 5000) return 500    // First 5s: poll every 500ms
            if (elapsed < 15000) return 1000  // 5-15s: poll every 1s
            return 2000                        // After 15s: poll every 2s
        }

        try {
            const { res, data } = await withRequestDeadline(async signal => {
                const res = await fetch(`/api/operations/${operationId}/packages`, { signal })
                return { res, data: await res.json() }
            })
            if (operationRef.current !== operationId || generation !== statusPollGeneration.current) return
            if (!res.ok) throw new Error('STATUS_POLL_FAILED')
            pollErrorCountRef.current = 0

            if (data.confirmationExpired || data.settlementState === 'REFUND_PENDING') {
                setResult({ success: false, pending: data.settlementState === 'REFUND_PENDING' ? 'pendingSettlement' : undefined, message: t => data.confirmationExpired
                    ? t.operations.confirmationExpired : t.operations.refundSettlementPending })
                setStep('result')
                return
            }

            if (data.status === 'AWAITING_CAPTCHA') {
                // Only skip showing CAPTCHA if user already submitted a solution
                // (worker is still processing it)
                if (captchaSubmitted) {
                    // User already submitted CAPTCHA, worker is processing it
                    statusPollTimer.current = setTimeout(pollStatus, getNextInterval())
                    return
                }

                // First time seeing CAPTCHA - show it
                const captchaRes = await fetch(`/api/operations/${operationId}/captcha`)
                const captchaData = await captchaRes.json()
                if (generation !== statusPollGeneration.current) return
                if (captchaData.captchaImage) {
                    setCaptchaImage(captchaData.captchaImage)
                    setStep('captcha')
                }
            } else if (data.status === 'AWAITING_PACKAGE') {
                // Packages ready
                consumeQuote(operationId, data)
                setStbNumber(data.stbNumber)
                setFinalConfirmExpiry(data.finalConfirmExpiry || null)
                setStep('packages')
            } else if (data.status === 'COMPLETED') {
                setResult({ success: true, message: t => t.renew.result.success })
                setStep('result')
                refetchBalance()
            } else if (data.status === 'CANCELLED') {
                setResult({ success: false, message: t => t.renew.toast.cancelled })
                setStep('result')
                refetchBalance()
            } else if (data.status === 'EXPIRED') {
                setResult({ success: false, message: t => t.renew.feedback.expired })
                setStep('result')
                refetchBalance()
            } else if (data.status === 'FAILED') {
                setResult({ success: false, message: t => data.messageKey === 'operations.providerSmartcardFormUnsupported'
                    ? t.operations.providerSmartcardFormUnsupported
                    : data.messageKey === 'operations.packageSelectionStopped'
                        ? t.operations.packageSelectionStopped : t.renew.result.failed })
                setStep('result')
            } else if (data.status === 'REVIEW_REQUIRED') {
                if (data.reportVerificationPending) {
                    setFulfillmentStatusMessage(true)
                    setStep('completing')
                    statusPollTimer.current = setTimeout(pollStatus, 2000)
                    return
                }
                setResult({
                    success: false,
                    pending: 'reviewRequired',
                    message: t => data.messageKey === 'operations.waitingForReport'
                        ? t.operations.waitingForReport
                        : data.messageKey === 'operations.packageQuoteChangedReview'
                        ? t.operations.packageQuoteChangedReview
                        : data.messageKey === 'operations.providerChargedFulfillmentUnderReview'
                        ? t.operations.providerChargedFulfillmentUnderReview
                        : t.operations.fulfillmentReviewPending
                })
                setStep('result')
            } else if (data.status === 'AWAITING_FINAL_CONFIRM') {
                // Show final confirmation dialog
                setSelectedPackageInfo(data.selectedPackage || null)
                setStbNumber(data.stbNumber || null)
                setFinalConfirmExpiry(data.finalConfirmExpiry || null)
                setStep('awaiting-final-confirm')
            } else if (data.status === 'PENDING' || data.status === 'PROCESSING' || data.status === 'COMPLETING') {
                setFulfillmentStatusMessage(
                    data.status === 'COMPLETING' &&
                    data.messageKey === 'operations.providerChargedVerifyingFulfillment'
                        ? true
                        : false
                )
                statusPollTimer.current = setTimeout(pollStatus, getNextInterval())
            }
        } catch {
            if (generation !== statusPollGeneration.current) return
            pollErrorCountRef.current += 1
            if (pollErrorCountRef.current >= MAX_POLL_ERROR_RETRIES) {
                setResult({
                    success: false,
                    message: t => t.renew.feedback.trackingLost
                })
                setStep('result')
                return
            }
            statusPollTimer.current = setTimeout(pollStatus, 2000)
        }
    }, [operationId, refetchBalance, captchaSubmitted, consumeQuote])

    useEffect(() => {
        if (!operationId || step !== 'packages' || quoteState !== 'PENDING' || quotePollStopped) return
        let cancelled = false
        let timer: ReturnType<typeof setTimeout>
        const controller = new AbortController()
        const deadline = Date.now() + 45_000
        const pollQuote = async () => {
            try {
                const { res, data } = await withRequestDeadline(async signal => {
                    const res = await fetch(`/api/operations/${operationId}/packages`, { signal })
                    return { res, data: await res.json() }
                }, Math.max(0, deadline - Date.now()), controller.signal)
                if (cancelled || operationRef.current !== operationId) return
                if (res.ok && data.status !== 'AWAITING_PACKAGE') {
                    setStep('processing')
                    return
                }
                if (res.ok && consumeQuote(operationId, data) && data.quoteState !== 'PENDING') return
            } catch { /* Keep the authoritative selection blocked until status is known. */ }
            if (cancelled) return
            if (Date.now() >= deadline) { setQuotePollStopped(true); return }
            timer = setTimeout(pollQuote, 1500)
        }
        timer = setTimeout(pollQuote, 750)
        return () => { cancelled = true; clearTimeout(timer); controller.abort() }
    }, [operationId, step, quoteState, quotePollStopped, consumeQuote])

    useEffect(() => {
        if (step === 'processing' || step === 'completing') {
            // Poll immediately — no dead wait
            pollStatus()
        }
        return () => {
            statusPollGeneration.current += 1
            if (statusPollTimer.current) clearTimeout(statusPollTimer.current)
        }
    }, [step, pollStatus])

    // Handle final confirmation
    const handleFinalConfirm = async () => {
        if (!operationId) return

        setIsConfirmLoading(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/confirm-purchase`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteRevision: selectedPackageInfo?.quoteRevision }) })
            const data = await res.json()

            if (res.ok) {
                setStep('completing')
                toast.success(t.renew.toast.completingPurchase)
            } else {
                toast.error(quoteErrorMessage(data))
                if (res.status === 409) { setSelectedPackageInfo(null); setStep('processing') }
            }
        } catch {
            toast.error(t.renew.toast.connectionError)
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
            await res.json()

            if (res.ok) {
                const message = (t: ReturnType<typeof useTranslation>['t']) => isAutoCancel
                    ? t.renew.toast.autoCancelled
                    : t.renew.toast.cancelled
                setResult({ success: false, message })
                setStep('result')
                refetchBalance()
                toast.info(message(t))
            } else {
                toast.error(t.renew.toast.cancelFailed)
            }
        } catch {
            toast.error(t.renew.toast.connectionError)
        } finally {
            setIsConfirmLoading(false)
            setIsAutoCancelling(false)
            setShowExpiryWarning(false)
        }
    }

    // Handle expiry warning shortly before auto-cancel
    const handleExpiryWarning = useCallback(() => {
        setShowExpiryWarning(true)
        toast.warning(t.renew.toast.expiryWarning, {
            duration: OPERATION_WARNING_THRESHOLD_SECONDS * 1000,
        })
    }, [t.renew.toast.expiryWarning])

    // Handle auto-cancel when timer expires
    const handleAutoExpire = useCallback(() => {
        if (isAutoCancelling) return

        if (step === 'packages') {
            // No money was deducted yet, so expire immediately and release the account lock.
            if (operationId) {
                requestPrePayOperationExpiry(operationId).catch(() => undefined)
            }
            setResult({ success: false, message: t => t.renew.feedback.selectionExpired })
            setStep('result')
        } else if (step === 'awaiting-final-confirm') {
            handleCancelConfirm(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAutoCancelling, operationId, step])

    // Start renewal
    const handleStartRenewal = async () => {
        if (cardCooldownSeconds > 0) return
        if (cardNumber.length < 10) {
            toast.error(t.renew.cardInput.error)
            return
        }

        if (startRenewalInFlightRef.current) {
            return
        }
        startRenewalInFlightRef.current = true

        setLoading(true)
        try {
            const res = await fetch('/api/operations/start-renewal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardNumber, smartcardType }),
            })
            const data = await res.json()

            if (!res.ok) {
                if (data.code === 'RENEWAL_FULFILLMENT_REVIEW_PENDING') {
                    const reason = typeof data.blockReason === 'string' && data.blockReason in t.renewalHold.holdReasons
                        ? t.renewalHold.holdReasons[data.blockReason as keyof typeof t.renewalHold.holdReasons]
                        : t.operations.fulfillmentReviewPending
                    toast.error(reason, { action: { label: t.renew.toast.existingOperationAction,
                        onClick: () => { window.location.href = session?.user?.role === 'ADMIN' && data.operationId
                            ? `/dashboard/admin/financial-review?q=${encodeURIComponent(data.operationId)}`
                            : '/dashboard/operations/active' } }, duration: 8000 })
                    return
                }
                if (data.code === 'RENEWAL_CARD_COOLDOWN') {
                    acceptCooldown(data)
                    toast.error(t.operations.cardCooldownActive)
                    return
                }
                // Check if this is a duplicate operation error (API returns operationId)
                if (
                    data.operationId &&
                    typeof data.error === 'string' &&
                    data.error.toLowerCase().includes('active operation')
                ) {
                    toast.error(
                        t.renew.toast.existingOperation,
                        {
                            action: {
                                label: t.renew.toast.existingOperationAction,
                                onClick: () => {
                                    window.location.href = '/dashboard/operations/active'
                                }
                            },
                            duration: 8000,
                        }
                    )
                } else {
                    toast.error(quoteErrorMessage(data))
                }
                return
            }

            setOperationId(data.operationId)
            pollStartTimeRef.current = Date.now()  // Start adaptive polling timer
            pollErrorCountRef.current = 0
            setStep('processing')
            toast.success(t.renew.toast.starting)
        } catch {
            toast.error(t.renew.toast.connectionError)
        } finally {
            setLoading(false)
            startRenewalInFlightRef.current = false
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
            await res.json()

            if (!res.ok) {
                toast.error(t.renew.toast.captchaInvalid)
                return
            }

            setCaptchaSolution('')
            setCaptchaSubmitted(true)  // Mark that we submitted CAPTCHA
            pollStartTimeRef.current = Date.now()  // Reset adaptive polling timer
            pollErrorCountRef.current = 0
            setStep('processing')
            toast.success(t.renew.toast.loadingPackages)
        } catch {
            toast.error(t.renew.toast.connectionError)
        } finally {
            setLoading(false)
        }
    }

    // Select package
    const handleSelectPackage = async () => {
        if (selectedPackageIndex === null || !operationId || quoteState !== 'READY' || loading) return

        const selectedPkg = packages.find(p => p.index === selectedPackageIndex)
        if (!selectedPkg) return

        if (balance < selectedPkg.price) {
            toast.error(t.renew.toast.insufficientBalance)
            return
        }

        setLoading(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/select-package`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    packageIndex: selectedPackageIndex,
                    quoteRevision,
                    packageKey: selectedPkg.packageKey,
                }),
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(quoteErrorMessage(data))
                if (res.status === 409) {
                    setShowConfirmation(false)
                    setSelectedPackageIndex(null)
                    setStep('processing')
                }
                return
            }

            setStep('completing')
            refetchBalance()
            toast.success(t.renew.completing.title)
        } catch {
            toast.error(t.common.error)
        } finally {
            setLoading(false)
        }
    }

    // An ambiguous HTTP retry reuses the exact request identity, never a new promo attempt.
    const handleApplyPromo = async (promoAction: 'APPLY' | 'REMOVE' = 'APPLY', retry = false) => {
        if (!operationId || loading || (!retry && quoteState === 'PENDING')) return
        const saved = retry ? promoRequestRef.current : null
        if (!saved && promoAction === 'APPLY' && !promoCode.trim()) return
        const request = saved || { operationId, actionRevision: quoteRevision + 1, promoAction,
            ...(promoAction === 'APPLY' ? { promoCode: promoCode.trim() } : {}) }
        promoRequestRef.current = request
        quoteRef.current = { operationId, revision: request.actionRevision, state: 'PENDING' }
        setQuoteRevision(request.actionRevision)
        setQuoteState('PENDING')
        setQuotePollStopped(false)
        setSelectedPackageIndex(null)
        setShowConfirmation(false)
        setLoading(true)
        try {
            const { res, data } = await withRequestDeadline(async signal => {
                const res = await fetch(`/api/operations/${operationId}/apply-promo`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(request), signal,
                })
                return { res, data: await res.json() }
            })
            if (operationRef.current !== operationId) return
            if (!res.ok) {
                // A server rejection is definitive. Reload its current revision;
                // transport failures instead retain this request for identical replay.
                promoRequestRef.current = null
                quoteRef.current = { operationId, revision: -1, state: 'PENDING' }
                toast.error(quoteErrorMessage(data))
                setStep('processing')
                return
            }
            consumeQuote(operationId, data)
        } catch {
            if (operationRef.current !== operationId) return
            setQuotePollStopped(true)
            toast.error(t.operations.packageQuoteRetry)
        } finally {
            setLoading(false)
        }
    }

    const handleQuoteRetry = () => {
        if (promoRequestRef.current) void handleApplyPromo('APPLY', true)
        else setQuotePollStopped(false)
    }

    // Reset wizard
    const handleReset = () => {
        setStep('card-input')
        setCardNumber('')
        setSmartcardType('CISCO')  // Reset smartcard type
        setOperationId(null)
        setPackages([])
        setSelectedPackageIndex(null)
        setPromoCode('')
        setAppliedPromoCode(null)
        setQuoteRevision(0)
        setQuoteState('PENDING')
        setQuotePollStopped(false)
        quoteRef.current = { operationId: '', revision: -1, state: 'PENDING' }
        promoRequestRef.current = null
        setCaptchaImage(null)
        setCaptchaSolution('')
        setCaptchaSubmitted(false)  // Reset CAPTCHA submitted state
        setShowConfirmation(false)  // Reset confirmation dialog
        setResult(null)
        setFulfillmentStatusMessage(false)
        setStbNumber(null)
        setFinalConfirmExpiry(null)
        setSelectedPackageInfo(null)
        setShowExpiryWarning(false)  // Reset expiry warning
        setIsAutoCancelling(false)  // Reset auto-cancelling flag
        pollErrorCountRef.current = 0
    }

    return (
        <div className="container max-w-full mx-auto py-8 px-[var(--space-lg)] md:overflow-x-auto">
            {/* Maintenance Mode Overlay - blocks interaction when enabled (admin bypasses) */}
            {!isMaintenanceLoading && isMaintenanceMode && !isAdmin && (
                <MaintenanceOverlay message={maintenanceMessage} pauseUntil={maintenancePauseUntil} />
            )}

            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00A651] to-[#008f45] bg-clip-text text-transparent">
                    {t.renew.title}
                </h1>
                <p className="text-muted-foreground mt-2">{t.renew.subtitle}</p>
            </div>

            {/* Mode Toggle Tabs */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
                <button
                    onClick={() => setRenewalMode('signal-refresh')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${renewalMode === 'signal-refresh'
                        ? 'bg-[#00A651] text-white shadow-lg shadow-[rgba(0,166,81,0.3)]'
                        : 'bg-[var(--color-bg-input)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                >
                    <Zap className="h-5 w-5" />
                    {t.signalRefresh.checkButton}
                </button>
                <button
                    onClick={() => setRenewalMode('package-renewal')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${renewalMode === 'package-renewal'
                        ? 'bg-[#00A651] text-white shadow-lg shadow-[rgba(0,166,81,0.3)]'
                        : 'bg-[var(--color-bg-input)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                >
                    <Package className="h-5 w-5" />
                    {t.renew.modes.packageRenewal}
                </button>
                <button
                    onClick={() => setRenewalMode('installment')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${renewalMode === 'installment'
                        ? 'bg-[#00A651] text-white shadow-lg shadow-[rgba(0,166,81,0.3)]'
                        : 'bg-[var(--color-bg-input)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                >
                    <CreditCard className="h-5 w-5" />
                    {t.renew.feedback.installments}
                </button>
            </div>

            {/* Signal Refresh Mode */}
            {renewalMode === 'signal-refresh' && (
                <SignalRefreshFlow />
            )}

            {/* Installment Payment Mode */}
            {renewalMode === 'installment' && (
                <div className="relative">
                    {isInstallmentDevMode && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md rounded-xl border border-border">
                            <Code className="w-12 h-12 text-blue-500 mb-3" />
                            <p className="text-lg font-bold text-foreground">{t.renew.feedback.developmentTitle}</p>
                            <p className="text-sm text-muted-foreground">{t.renew.feedback.developmentDescription}</p>
                        </div>
                    )}
                    <div className={isInstallmentDevMode ? 'pointer-events-none select-none opacity-50 blur-sm' : ''}>
                        <InstallmentPaymentFlow />
                    </div>
                </div>
            )}

            {/* Package Renewal Mode (existing wizard) */}
            {renewalMode === 'package-renewal' && (
                <>
                    <StepIndicator currentStep={step} />
                    <CardCooldownNotice cardNumber={cardNumber} remainingSeconds={cardCooldownSeconds} />

                    {/* Step 1: Card Input */}
                    {step === 'card-input' && (
                        <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CreditCard className="h-5 w-5 text-[#00A651]" />
                                    {t.renew.cardInput.title}
                                </CardTitle>
                                <CardDescription>{t.renew.cardInput.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Smartcard Type Selection */}
                                <div>
                                    <Label htmlFor="smartcardType">{t.renew.feedback.smartcardType}</Label>
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            type="button"
                                            onClick={() => setSmartcardType('CISCO')}
                                            className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all border-2 ${smartcardType === 'CISCO'
                                                ? 'border-[#00A651] bg-[#00A651]/10 text-[#00A651] shadow-sm'
                                                : 'border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[#00A651]/50'
                                                }`}
                                        >
                                            {t.renew.feedback.smartcard.replace('{type}', 'CISCO')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSmartcardType('IRDETO')}
                                            className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all border-2 ${smartcardType === 'IRDETO'
                                                ? 'border-[#00A651] bg-[#00A651]/10 text-[#00A651] shadow-sm'
                                                : 'border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[#00A651]/50'
                                                }`}
                                        >
                                            {t.renew.feedback.smartcard.replace('{type}', 'Irdeto')}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="cardNumber">{t.renew.cardInput.label}</Label>
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
                                        <p className="text-xs text-red-500 mt-1">{t.renew.cardInput.error}</p>
                                    )}
                                </div>
                                <Button
                                    onClick={handleStartRenewal}
                                    disabled={cardNumber.length < 10 || loading || cardCooldownSeconds > 0}
                                    className="w-full bg-[#00A651] hover:bg-[#008f45]"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                            {t.renew.cardInput.loading}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4 ml-2" />
                                            {t.renew.cardInput.button}
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Processing State */}
                    {step === 'processing' && (
                        <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                            <CardContent className="py-12 text-center">
                                <Loader2 className="h-12 w-12 animate-spin text-[#00A651] mx-auto mb-4" />
                                <h3 className="text-xl font-semibold mb-2">{t.renew.toast.loadingPackages}</h3>
                                <p className="text-muted-foreground">{t.renew.processing.description}</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Step 2: Captcha */}
                    {step === 'captcha' && (
                        <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Lock className="h-5 w-5 text-amber-500" />
                                    {t.renew.captcha.title}
                                </CardTitle>
                                <CardDescription>{t.renew.captcha.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {captchaImage && (
                                    <div className="flex justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={captchaImage.startsWith('data:') ? captchaImage : `data:image/png;base64,${captchaImage}`}
                                            alt={t.renew.captcha.title}
                                            className="border rounded-lg"
                                        />
                                    </div>
                                )}
                                <div>
                                    <Label htmlFor="captcha">{t.renew.captcha.label}</Label>
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
                                            {t.renew.captcha.loading}
                                        </>
                                    ) : (
                                        t.renew.captcha.button
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Step 3: Package Selection */}
                    {step === 'packages' && (
                        <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Package className="h-5 w-5 text-green-500" />
                                    {t.renew.packages.title}
                                </CardTitle>
                                <CardDescription>
                                    {stbNumber && <span>{t.renew.packages.receiverNumber} <strong dir="ltr">{stbNumber}</strong></span>}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Package Selection Timer */}
                                {finalConfirmExpiry && (
                                    <FinalConfirmTimer
                                        expiry={finalConfirmExpiry}
                                        onWarning={handleExpiryWarning}
                                        onExpire={handleAutoExpire}
                                        warningThreshold={OPERATION_WARNING_THRESHOLD_SECONDS}
                                    />
                                )}
                                {packages.length > 0 && (
                                    <div>
                                        <Label htmlFor="promoCode">{t.renew.packages.promoLabel}</Label>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <Input
                                                id="promoCode"
                                                type="text"
                                                value={promoCode}
                                                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                                aria-describedby="promo-quote-status"
                                                dir="ltr"
                                                className="flex-1"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => handleApplyPromo()}
                                                disabled={!promoCode.trim() || loading || quoteState === 'PENDING'}
                                                className="shrink-0"
                                            >
                                                {loading ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    t.renew.packages.applyPromo
                                                )}
                                            </Button>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-2">{t.operations.promoDraftHelp}</p>
                                        {(appliedPromoCode || quoteState === 'FAILED') && (
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {appliedPromoCode && <span>{t.operations.promoAppliedCode} <bdi>{appliedPromoCode}</bdi></span>}
                                                <Button type="button" variant="outline" onClick={() => handleApplyPromo('REMOVE')}
                                                    disabled={loading || quoteState === 'PENDING'}>{t.operations.promoRemove}</Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div id="promo-quote-status" role="status" aria-live="polite" aria-atomic="true" className="text-sm break-words">
                                    {quoteState === 'PENDING' ? (quotePollStopped ? t.operations.packageQuoteRetry : t.operations.packageQuotePending)
                                        : quoteState === 'FAILED' ? t.operations.packageQuoteFailed
                                            : quoteRevision > 0 ? t.operations.packageQuoteUpdated : null}
                                </div>
                                {quotePollStopped && quoteState === 'PENDING' && (
                                    <Button type="button" variant="outline" onClick={handleQuoteRetry} disabled={loading}>
                                        {t.operations.packageQuoteResume}
                                    </Button>
                                )}
                                {packages.length === 0 && quoteState === 'READY' ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                                        {t.renew.packages.noPackages}
                                    </div>
                                ) : packages.length > 0 ? (
                                    <div className="space-y-3">
                                        {packages.map((pkg) => (
                                            <button
                                                type="button"
                                                key={pkg.packageKey}
                                                disabled={loading || quoteState !== 'READY'}
                                                aria-pressed={selectedPackageIndex === pkg.index}
                                                onClick={() => { setSelectedPackageIndex(pkg.index); setShowConfirmation(false) }}
                                                className={`w-full text-start p-4 rounded-xl border-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${selectedPackageIndex === pkg.index
                                                    ? 'border-[#00A651] bg-[#00A651]/10'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-[#00A651]/50'
                                                    }`}
                                            >
                                                <div className="flex flex-wrap gap-3 justify-between items-center">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-bold break-words"><bdi>{pkg.name}</bdi></div>
                                                    </div>
                                                    <div className="text-lg font-bold text-[#00A651]">
                                                        {pkg.price} {pkg.currency || 'USD'}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                {packages.length > 0 && (
                                    <>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                                            <div className="flex justify-between text-sm">
                                                <span>{t.renew.packages.currentBalance}</span>
                                                <span className={balance >= (packages.find(p => p.index === selectedPackageIndex)?.price || 0) ? 'text-green-600' : 'text-red-600'}>
                                                    {balance} USD
                                                </span>
                                            </div>
                                        </div>

                                        {/* Show confirmation only when package is selected */}
                                        {quoteState === 'READY' && selectedPackageIndex !== null && !showConfirmation && (
                                            <Button
                                                onClick={() => setShowConfirmation(true)}
                                                disabled={loading}
                                                className="w-full bg-[#00A651] hover:bg-[#008f45]"
                                            >
                                                {t.renew.packages.showDetails}
                                            </Button>
                                        )}

                                        {/* Confirmation Dialog */}
                                        {quoteState === 'READY' && showConfirmation && selectedPackageIndex !== null && (
                                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 sm:p-6 space-y-4">
                                                <div className="text-center">
                                                    <h3 className="text-xl font-bold text-amber-800 dark:text-amber-200 mb-2">
                                                        ⚠️ {t.renew.packages.confirmTitle}
                                                    </h3>
                                                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                                                        {t.renew.packages.confirmMessage}
                                                    </p>
                                                </div>

                                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-3">
                                                    <div className="flex flex-wrap gap-2 justify-between items-center">
                                                        <span className="text-gray-600 dark:text-gray-400">{t.renew.packages.selectedPackage}</span>
                                                        <span className="font-bold text-lg break-words min-w-0">
                                                            {packages.find(p => p.index === selectedPackageIndex)?.name}
                                                        </span>
                                                    </div>
                                                    <hr className="border-gray-200 dark:border-gray-700" />
                                                    <div className="flex flex-wrap gap-2 justify-between items-center">
                                                        <span className="text-gray-600 dark:text-gray-400">{t.renew.packages.totalAmount}</span>
                                                        <span className="font-bold text-2xl whitespace-nowrap text-green-600 dark:text-green-400" dir="ltr">
                                                            {packages.find(p => p.index === selectedPackageIndex)?.price} {packages.find(p => p.index === selectedPackageIndex)?.currency || 'USD'}
                                                        </span>
                                                    </div>
                                                    {appliedPromoCode && (
                                                        <>
                                                            <hr className="border-gray-200 dark:border-gray-700" />
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-gray-600 dark:text-gray-400">{t.operations.promoAppliedCode}</span>
                                                                <span className="font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                                                                    {appliedPromoCode}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-3">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => setShowConfirmation(false)}
                                                        disabled={loading}
                                                        className="flex-1 min-w-32 h-auto whitespace-normal py-3"
                                                    >
                                                        {t.renew.packages.editChoice}
                                                    </Button>
                                                    <Button
                                                        onClick={handleSelectPackage}
                                                        disabled={loading}
                                                        className="flex-1 min-w-32 h-auto whitespace-normal py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600"
                                                    >
                                                        {loading ? (
                                                            <>
                                                                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                                                {t.renew.packages.purchasing}
                                                            </>
                                                        ) : (
                                                            t.renew.packages.confirmPurchase
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
                        <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                            <CardContent className="py-12 text-center">
                                <Loader2 className="h-12 w-12 animate-spin text-[#00A651] mx-auto mb-4" />
                                <h3 className="text-xl font-semibold mb-2">
                                    {fulfillmentStatusMessage ? t.operations.providerChargedVerifyingFulfillment : t.renew.completing.title}
                                </h3>
                                <p className="text-muted-foreground">{t.renew.completing.warning}</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Step: Awaiting Final Confirm */}
                    {step === 'awaiting-final-confirm' && (
                        <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                            <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="h-8 w-8" />
                                    <div>
                                        <CardTitle className="text-white text-xl">{t.renew.finalConfirm.title}</CardTitle>
                                        <CardDescription className="text-orange-100">{t.renew.finalConfirm.description}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                {/* Package Info */}
                                <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                                    <div className="flex justify-between items-start gap-3">
                                        <span className="shrink-0 text-muted-foreground">{t.renew.finalConfirm.package}</span>
                                        <span className="min-w-0 break-words text-end font-bold text-foreground">{selectedPackageInfo?.name || t.installment.notSpecified}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t.renew.finalConfirm.price}</span>
                                        <span className="font-bold text-green-600 dark:text-green-400">{selectedPackageInfo?.price || 0} {selectedPackageInfo?.currency || 'USD'}</span>
                                    </div>
                                    {stbNumber && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">{t.renew.packages.receiverNumber}</span>
                                            <span className="font-mono text-sm" dir="ltr">{stbNumber}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t.renew.finalConfirm.cardNumber}</span>
                                        <span className="font-mono text-sm" dir="ltr">{cardNumber}</span>
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
                                            ⚠️ {t.renew.finalConfirm.warning}
                                        </span>
                                    </div>
                                )}

                                {/* Warning */}
                                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-700 dark:text-red-300">
                                        {t.renew.feedback.paymentWarning}
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
                                        {t.renew.finalConfirm.cancel}
                                    </Button>
                                    <Button
                                        onClick={handleFinalConfirm}
                                        disabled={isConfirmLoading || isAutoCancelling}
                                        className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                                    >
                                        {isConfirmLoading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                                {t.renew.finalConfirm.confirming}
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="h-4 w-4 ml-2" />
                                                {t.renew.finalConfirm.confirm}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Step 4: Result */}
                    {step === 'result' && result && (
                        <Card className={`bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] border-2 ${result.success ? 'border-green-200 dark:border-green-900/30' : result.pending ? 'border-amber-200 dark:border-amber-900/30' : 'border-red-200 dark:border-red-900/30'}`}>
                            <CardContent className="py-12 text-center">
                                {result.success ? (
                                    <>
                                        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                                        <h3 className="text-2xl font-bold text-green-600 mb-2">{t.renew.result.success}</h3>
                                    </>
                                ) : result.pending ? (
                                    <>
                                        <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
                                        <h3 className="text-2xl font-bold text-amber-600 mb-2">{t.panelUi[result.pending]}</h3>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                                        <h3 className="text-2xl font-bold text-red-600 mb-2">{t.renew.result.failed}</h3>
                                    </>
                                )}
                                <p className="text-muted-foreground mb-6">{result.message(t)}</p>
                                {result.success && operationId && (
                                    <a href={`/dashboard/operations/${operationId}/receipt`}
                                        className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 me-3 mb-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                                        {t.renewalReceipt.view}
                                    </a>
                                )}
                                <Button onClick={handleReset} variant="outline" className="gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    {t.renew.result.newOperation}
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    )
}
