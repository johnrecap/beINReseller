'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { CardStatusDisplay } from './CardStatusDisplay'
import { Loader2, Zap, CreditCard, CheckCircle, XCircle, RefreshCw } from 'lucide-react'

interface CardStatus {
    isPremium: boolean
    smartCardSerial: string
    stbNumber: string
    expiryDate: string
    walletBalance: number
    activateCount: { current: number; max: number }
}

type FlowStep = 'input' | 'processing' | 'status' | 'activating' | 'success' | 'error'

/**
 * SignalRefreshFlow - Complete flow for signal refresh
 * Steps: Input card -> Check status -> Show status -> Activate -> Result
 */
export function SignalRefreshFlow() {
    const { t } = useTranslation()
    const sr = (t as any).signalRefresh || {}

    const [step, setStep] = useState<FlowStep>('input')
    const [cardNumber, setCardNumber] = useState('')
    const [operationId, setOperationId] = useState<string | null>(null)
    const [cardStatus, setCardStatus] = useState<CardStatus | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [activated, setActivated] = useState(false)

    // Poll for operation status
    useEffect(() => {
        if (!operationId) return

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/operations/${operationId}`)
                const data = await res.json()

                if (data.status === 'COMPLETED') {
                    clearInterval(pollInterval)

                    // Extract card status from response
                    if (data.responseData?.cardStatus) {
                        setCardStatus(data.responseData.cardStatus)
                        setActivated(data.responseData.activated || false)
                        setStep(data.responseData.activated ? 'success' : 'status')
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
    }, [operationId])

    // Start signal refresh
    const handleStartRefresh = async () => {
        if (cardNumber.length < 10) {
            setError(sr.invalidCard || 'رقم الكارت غير صحيح')
            return
        }

        setError(null)
        setStep('processing')

        try {
            const res = await fetch('/api/operations/signal-refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardNumber })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'فشل في بدء العملية')
            }

            setOperationId(data.operationId)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'حدث خطأ')
            setStep('error')
        }
    }

    // Reset flow
    const handleReset = () => {
        setStep('input')
        setCardNumber('')
        setOperationId(null)
        setCardStatus(null)
        setError(null)
        setActivated(false)
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
                        onClick={handleStartRefresh}
                        disabled={cardNumber.length < 10}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                        <Zap className="w-5 h-5" />
                        {sr.startButton || 'تجديد الإشارة'}
                    </button>
                </div>
            )}

            {/* Processing Step */}
            {step === 'processing' && (
                <div className="text-center space-y-4 py-8">
                    <Loader2 className="w-12 h-12 mx-auto text-purple-500 animate-spin" />
                    <p className="text-gray-600 dark:text-gray-400">
                        {sr.processing || 'جاري فحص الكارت وتجديد الإشارة...'}
                    </p>
                </div>
            )}

            {/* Status Display Step */}
            {step === 'status' && cardStatus && (
                <div className="space-y-4">
                    <CardStatusDisplay {...cardStatus} />

                    <div className="flex gap-3">
                        <button
                            onClick={handleReset}
                            className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                        >
                            {sr.tryAnother || 'كارت آخر'}
                        </button>
                    </div>
                </div>
            )}

            {/* Success Step */}
            {step === 'success' && (
                <div className="text-center space-y-4 py-8">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
                    <h3 className="text-xl font-bold text-green-600 dark:text-green-400">
                        {activated
                            ? (sr.successActivated || 'تم تجديد الإشارة بنجاح!')
                            : (sr.successChecked || 'تم فحص الكارت بنجاح!')}
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
