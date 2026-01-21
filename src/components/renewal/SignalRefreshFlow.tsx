'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { CardStatusDisplay } from './CardStatusDisplay'
import { ContractsTable } from './ContractsTable'
import { Loader2, Zap, CreditCard, CheckCircle, XCircle, RefreshCw, Search } from 'lucide-react'

interface Contract {
    type: string
    status: string
    package: string
    startDate: string
    expiryDate: string
    invoiceNo: string
}

interface CardStatus {
    isPremium: boolean
    smartCardSerial: string
    stbNumber: string
    expiryDate: string
    walletBalance: number
    activateCount: { current: number; max: number }
    canActivate?: boolean
}

type FlowStep = 'input' | 'checking' | 'status' | 'activating' | 'success' | 'error'

/**
 * SignalRefreshFlow - Two-step flow for signal refresh
 * Step 1: Input card -> Check status -> Show status with Activate button
 * Step 2: User clicks Activate -> Activation happens -> Result
 */
export function SignalRefreshFlow() {
    const { t } = useTranslation()
    const sr = (t as any).signalRefresh || {}

    const [step, setStep] = useState<FlowStep>('input')
    const [cardNumber, setCardNumber] = useState('')
    const [operationId, setOperationId] = useState<string | null>(null)
    const [cardStatus, setCardStatus] = useState<CardStatus | null>(null)
    const [contracts, setContracts] = useState<Contract[]>([])
    const [error, setError] = useState<string | null>(null)
    const [activating, setActivating] = useState(false)
    const [pollTrigger, setPollTrigger] = useState(0) // Used to restart polling

    // Poll for operation status
    useEffect(() => {
        if (!operationId) return

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/operations/${operationId}`)
                const data = await res.json()

                if (data.status === 'COMPLETED') {
                    clearInterval(pollInterval)

                    // Parse responseData if it's a string
                    const responseData = typeof data.responseData === 'string'
                        ? JSON.parse(data.responseData)
                        : data.responseData

                    if (responseData?.cardStatus) {
                        setCardStatus(responseData.cardStatus)

                        // Set contracts if available
                        if (responseData.contracts) {
                            setContracts(responseData.contracts)
                        }

                        // Check if this was:
                        // 1. A check operation (awaitingActivate = true) -> show status with activate button
                        // 2. An activation operation (activated = true/false) -> show success/error
                        if (responseData.awaitingActivate) {
                            // Step 1 completed - show status with activate button
                            setStep('status')
                            setError(null)
                        } else if (responseData.activated) {
                            // Activation succeeded
                            setStep('success')
                        } else {
                            // Activation failed
                            setError(responseData.error || 'لم يتم التفعيل')
                            setStep('status')
                        }
                    } else {
                        setStep('success')
                    }
                } else if (data.status === 'FAILED') {
                    clearInterval(pollInterval)
                    setError(data.responseMessage || 'فشلت العملية')
                    setStep('error')
                }
            } catch (err: unknown) {
                console.error('Poll error:', err)
            }
        }, 2000)

        return () => clearInterval(pollInterval)
    }, [operationId, pollTrigger]) // Include pollTrigger to restart polling

    // Step 1: Check card status
    const handleCheckCard = async () => {
        if (cardNumber.length < 10) {
            setError(sr.invalidCard || 'رقم الكارت غير صحيح')
            return
        }

        setError(null)
        setStep('checking')

        try {
            const res = await fetch('/api/operations/signal-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardNumber })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'فشل في فحص الكارت')
            }

            setOperationId(data.operationId)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'حدث خطأ')
            setStep('error')
        }
    }

    // Step 2: Activate signal
    const handleActivate = async () => {
        if (!operationId) return

        setActivating(true)
        setStep('activating')
        setError(null)

        try {
            const res = await fetch('/api/operations/signal-activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId, cardNumber })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'فشل في تفعيل الإشارة')
            }

            // Update operationId if new one was created
            if (data.operationId) {
                setOperationId(data.operationId)
            }

            // Trigger polling restart
            setPollTrigger(prev => prev + 1)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'حدث خطأ في التفعيل')
            setStep('status') // Go back to status so user can retry
            setActivating(false)
        }
    }

    // Reset flow
    const handleReset = () => {
        setStep('input')
        setCardNumber('')
        setOperationId(null)
        setCardStatus(null)
        setError(null)
        setActivating(false)
    }

    return (
        <div className="max-w-lg mx-auto space-y-6">
            {/* Input Step */}
            {step === 'input' && (
                <div className="space-y-4">
                    <div className="text-center">
                        <Zap className="w-12 h-12 mx-auto text-purple-500 mb-2" />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {sr.title || 'تجديد الإشارة'}
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {sr.description || 'أدخل رقم الكارت لتجديد إشارة الريسيفر'}
                        </p>
                    </div>

                    <div className="relative">
                        <CreditCard className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
                            placeholder={sr.cardPlaceholder || 'أدخل رقم الكارت (10-16 رقم)'}
                            className="w-full ps-10 pe-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            maxLength={16}
                            dir="ltr"
                        />
                    </div>

                    {error && (
                        <p className="text-red-500 text-sm text-center">{error}</p>
                    )}

                    <button
                        onClick={handleCheckCard}
                        disabled={cardNumber.length < 10}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                        <Search className="w-5 h-5" />
                        {sr.checkButton || 'فحص الكارت'}
                    </button>
                </div>
            )}

            {/* Checking Step */}
            {step === 'checking' && (
                <div className="text-center space-y-4 py-8">
                    <Loader2 className="w-12 h-12 mx-auto text-purple-500 animate-spin" />
                    <p className="text-gray-600 dark:text-gray-400">
                        {sr.checking || 'جاري فحص الكارت...'}
                    </p>
                </div>
            )}

            {/* Status Display Step - with Activate Button */}
            {step === 'status' && cardStatus && (
                <div className="space-y-4">
                    <CardStatusDisplay {...cardStatus} />

                    {/* Contracts Table */}
                    {contracts.length > 0 && (
                        <ContractsTable contracts={contracts} />
                    )}

                    {error && (
                        <p className="text-red-500 text-sm text-center">{error}</p>
                    )}

                    <div className="flex gap-3">
                        {/* Activate Button - only if can activate */}
                        {cardStatus.canActivate !== false && cardStatus.activateCount.current < cardStatus.activateCount.max && (
                            <button
                                onClick={handleActivate}
                                disabled={activating}
                                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-medium rounded-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                            >
                                <Zap className="w-5 h-5" />
                                {sr.activateButton || 'تفعيل الإشارة'}
                            </button>
                        )}

                        <button
                            onClick={handleReset}
                            className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                        >
                            {sr.tryAnother || 'كارت آخر'}
                        </button>
                    </div>
                </div>
            )}

            {/* Activating Step */}
            {step === 'activating' && (
                <div className="text-center space-y-4 py-8">
                    <Loader2 className="w-12 h-12 mx-auto text-green-500 animate-spin" />
                    <p className="text-gray-600 dark:text-gray-400">
                        {sr.activating || 'جاري تفعيل الإشارة...'}
                    </p>
                </div>
            )}

            {/* Success Step */}
            {step === 'success' && (
                <div className="text-center space-y-4 py-8">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
                    <h3 className="text-xl font-bold text-green-600 dark:text-green-400">
                        {sr.successActivated || 'تم تفعيل الإشارة بنجاح!'}
                    </h3>

                    {cardStatus && (
                        <div className="mt-4">
                            <CardStatusDisplay {...cardStatus} />
                        </div>
                    )}

                    <button
                        onClick={handleReset}
                        className="mt-4 px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-2 mx-auto"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {sr.refreshAnother || 'تجديد كارت آخر'}
                    </button>
                </div>
            )}

            {/* Error Step */}
            {step === 'error' && (
                <div className="text-center space-y-4 py-8">
                    <XCircle className="w-16 h-16 mx-auto text-red-500" />
                    <h3 className="text-xl font-bold text-red-600 dark:text-red-400">
                        {sr.error || 'حدث خطأ'}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        {error}
                    </p>
                    <button
                        onClick={handleReset}
                        className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                    >
                        {sr.tryAgain || 'حاول مرة أخرى'}
                    </button>
                </div>
            )}
        </div>
    )
}

export default SignalRefreshFlow
