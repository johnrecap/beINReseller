'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { POLLING_INTERVAL_MS } from '@/lib/constants'
import { useTranslation } from '@/hooks/useTranslation'

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage?: string
    responseData?: any
}

interface ResultDisplayProps {
    operationId: string | null
    onClose: () => void
    onStatusChange?: (status: string) => void
}

export default function ResultDisplay({ operationId, onClose, onStatusChange }: ResultDisplayProps) {
    const { t } = useTranslation()
    const [operation, setOperation] = useState<Operation | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [cancelling, setCancelling] = useState(false)

    // Captcha States
    const [captchaImage, setCaptchaImage] = useState<string | null>(null)
    const [captchaSolution, setCaptchaSolution] = useState('')
    const [submittingCaptcha, setSubmittingCaptcha] = useState(false)
    const [captchaExpiry, setCaptchaExpiry] = useState<number | null>(null)

    const fetchOperation = useCallback(async () => {
        if (!operationId) return

        try {
            const res = await fetch(`/api/operations/${operationId}`)
            const data = await res.json()

            if (!res.ok) {
                setError(data.error || t.common.error)
                return
            }

            setOperation(data)
            onStatusChange?.(data.status)

            // Handle CAPTCHA status
            if (data.status === 'AWAITING_CAPTCHA') {
                const captchaRes = await fetch(`/api/operations/${operationId}/captcha`)
                if (captchaRes.ok) {
                    const captchaData = await captchaRes.json()
                    setCaptchaImage(captchaData.captchaImage)
                    setCaptchaExpiry(captchaData.expiresIn)
                }
            }

            // Stop polling if completed or failed
            if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
                setLoading(false)
            }
        } catch (err) {
            setError(t.common.retry)
        }
    }, [operationId, onStatusChange, t.common.error, t.common.retry])

    useEffect(() => {
        if (!operationId) return

        // Initial fetch
        fetchOperation()

        // Start polling
        const interval = setInterval(() => {
            if (operation && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) {
                clearInterval(interval)
                return
            }
            fetchOperation()
        }, POLLING_INTERVAL_MS)

        return () => clearInterval(interval)
    }, [operationId, fetchOperation, operation?.status])

    const submitCaptcha = async () => {
        if (!operationId || !captchaSolution) return

        setSubmittingCaptcha(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/captcha`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ solution: captchaSolution })
            })

            if (!res.ok) {
                const data = await res.json()
                setError(data.error || t.common.error)
                setSubmittingCaptcha(false)
                return
            }

            // Clear captcha state and refresh operation
            setCaptchaSolution('')
            setCaptchaImage(null)
            fetchOperation()
        } catch (err) {
            setError(t.common.error)
        } finally {
            setSubmittingCaptcha(false)
        }
    }

    const handleCancel = async () => {
        if (!operationId || cancelling) return

        setCancelling(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/cancel`, {
                method: 'POST',
            })
            const data = await res.json()

            if (!res.ok) {
                setError(data.error)
                return
            }

            // Refresh operation status
            fetchOperation()
        } catch (err) {
            setError(t.resultDisplay.status.FAILED)
        } finally {
            setCancelling(false)
        }
    }

    if (!operationId) return null

    const getStatusIcon = () => {
        if (!operation) return <Loader2 className="w-8 h-8 animate-spin text-purple-500" />

        switch (operation.status) {
            case 'PENDING':
            case 'PROCESSING':
            case 'AWAITING_CAPTCHA':
                return <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            case 'COMPLETED':
                return <CheckCircle2 className="w-8 h-8 text-green-500" />
            case 'FAILED':
                return <XCircle className="w-8 h-8 text-red-500" />
            case 'CANCELLED':
                return <Clock className="w-8 h-8 text-gray-400" />
            default:
                return <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        }
    }

    const getStatusColor = () => {
        if (!operation) return 'border-purple-200 bg-purple-50'

        switch (operation.status) {
            case 'AWAITING_CAPTCHA':
                return 'border-yellow-200 bg-yellow-50'
            case 'COMPLETED':
                return 'border-green-200 bg-green-50'
            case 'FAILED':
                return 'border-red-200 bg-red-50'
            case 'CANCELLED':
                return 'border-gray-200 bg-gray-50'
            default:
                return 'border-purple-200 bg-purple-50'
        }
    }

    return (
        <div className={cn(
            "mt-6 p-6 rounded-xl border-2 transition-all relative",
            getStatusColor()
        )}>
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-2 left-2 p-1 rounded-full hover:bg-white/50"
                aria-label={t.common.close}
            >
                <X className="w-4 h-4 text-gray-400" />
            </button>

            <div className="flex flex-col items-center text-center">
                {/* Status Icon */}
                <div className="mb-4">{getStatusIcon()}</div>

                {/* Status Text */}
                <h3 className="text-lg font-bold mb-2">
                    {operation ? (operation.status === 'AWAITING_CAPTCHA' ? t.resultDisplay.awaitingCaptcha : (t.resultDisplay.status as any)[operation.status] || operation.status) : t.common.loading}
                </h3>

                {/* Response Message */}
                {operation?.responseMessage && (
                    <p className={cn(
                        "text-sm mb-4",
                        operation.status === 'FAILED' ? 'text-red-600' : 'text-gray-600'
                    )}>
                        {operation.responseMessage}
                    </p>
                )}

                {/* Error */}
                {error && (
                    <p className="text-sm text-red-600 mb-4">{error}</p>
                )}

                {/* Manual CAPTCHA Form */}
                {operation?.status === 'AWAITING_CAPTCHA' && captchaImage && (
                    <div className="w-full max-w-sm bg-white/80 p-4 rounded-xl shadow-sm border border-yellow-200 mb-4 animate-in fade-in zoom-in duration-300">
                        <h4 className="font-bold text-yellow-800 mb-3 flex items-center justify-center gap-2">
                            <span>🔐</span> {t.resultDisplay.enterCaptcha}
                        </h4>

                        <div className="bg-white p-2 rounded-lg border mb-3 flex justify-center">
                            <img
                                src={`data:image/png;base64,${captchaImage}`}
                                alt="CAPTCHA"
                                className="max-h-16 object-contain"
                            />
                        </div>

                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={captchaSolution}
                                onChange={(e) => setCaptchaSolution(e.target.value)}
                                placeholder={t.resultDisplay.typeHere}
                                className="flex-1 p-2 border rounded-lg text-center font-mono text-lg focus:ring-2 focus:ring-yellow-400 outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && submitCaptcha()}
                                autoFocus
                            />
                            <button
                                onClick={submitCaptcha}
                                disabled={!captchaSolution || submittingCaptcha}
                                className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors font-bold"
                            >
                                {submittingCaptcha ? <Loader2 className="w-5 h-5 animate-spin" /> : t.resultDisplay.send}
                            </button>
                        </div>
                        {captchaExpiry && (
                            <p className="text-xs text-center text-gray-500 mt-2">
                                {t.resultDisplay.captchaExpires.replace('{{seconds}}', Math.round(captchaExpiry).toString())}
                            </p>
                        )}
                    </div>
                )}

                {/* Operation Details */}
                {operation && (
                    <div className="w-full bg-white/50 rounded-lg p-4 text-sm text-right space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-500">{t.forms.cardNumber}:</span>
                            <span className="font-mono">****{operation.cardNumber.slice(-4)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">{t.forms.amount}:</span>
                            <span className="font-bold">{operation.amount} {t.header.currency}</span>
                        </div>
                    </div>
                )}

                {/* Cancel Button (only for PENDING or AWAITING_CAPTCHA) */}
                {operation && ['PENDING', 'AWAITING_CAPTCHA'].includes(operation.status) && (
                    <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="mt-4 px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-all flex items-center gap-2"
                    >
                        {cancelling ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t.resultDisplay.cancelling}
                            </>
                        ) : (
                            t.resultDisplay.cancelOperation
                        )}
                    </button>
                )}
            </div>
        </div>
    )
}
