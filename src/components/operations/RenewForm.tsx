'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Zap, Loader2 } from 'lucide-react'
import { DURATION_OPTIONS, MIN_BALANCE_WARNING } from '@/lib/constants'
import { usePrices } from '@/hooks/usePrices'
import { useTranslation } from '@/hooks/useTranslation'
import ResultDisplay from './ResultDisplay'

export default function RenewForm() {
    const { data: session, update: updateSession } = useSession()
    const { getPrice, loading: pricesLoading } = usePrices()
    const { t } = useTranslation()
    const [cardNumber, setCardNumber] = useState('')
    const [duration, setDuration] = useState('1_month')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [operationId, setOperationId] = useState<string | null>(null)

    const priceKey = `RENEW_${duration.toUpperCase()}` as any
    const price = getPrice(priceKey)
    const balance = session?.user?.balance || 0
    const canSubmit = cardNumber.length >= 10 && balance >= price && !loading && !pricesLoading

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return

        setLoading(true)
        setError(null)
        setOperationId(null)

        try {
            const res = await fetch('/api/operations/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'RENEW',
                    cardNumber,
                    duration,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || t.common.error)
                return
            }

            // Show result display and start polling
            setOperationId(data.operationId)

            // Update session to reflect new balance
            await updateSession()
        } catch (err) {
            setError(t.common.error)
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setOperationId(null)
        setCardNumber('')
        setDuration('1_month')
    }

    return (
        <div className="relative">
            {/* Low Balance Warning */}
            {balance < MIN_BALANCE_WARNING && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                    ⚠️ {t.forms.lowBalanceWarning} ({balance} {t.header.currency})
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Card Number Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t.forms.cardNumber}
                    </label>
                    <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                        placeholder={t.forms.enterCardNumber}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-left dir-ltr font-mono"
                        disabled={loading || !!operationId}
                    />
                    {cardNumber && cardNumber.length < 10 && (
                        <p className="text-xs text-red-500 mt-1">{t.forms.invalidCard}</p>
                    )}
                </div>

                {/* Duration Select */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t.forms.duration}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        {DURATION_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setDuration(option.value)}
                                disabled={loading || !!operationId}
                                className={`p-4 rounded-xl border-2 transition-all text-right ${duration === option.value
                                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                                    : 'border-gray-200 hover:border-purple-300'
                                    }`}
                            >
                                <div className="font-bold">
                                    {(t.forms as any)[`duration_${option.value}`] || option.label}
                                </div>
                                <div className="text-sm text-purple-600">
                                    {getPrice(`RENEW_${option.value.toUpperCase()}` as any)} {t.header.currency}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Price Summary */}
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl p-4">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">{t.forms.price}:</span>
                        <span className="text-2xl font-bold text-purple-700">{price} {t.header.currency}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 text-sm">
                        <span className="text-gray-500">{t.forms.yourBalance}:</span>
                        <span className={balance >= price ? 'text-green-600' : 'text-red-600'}>
                            {balance} {t.header.currency}
                        </span>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        ❌ {error}
                    </div>
                )}

                {/* Submit Button */}
                {!operationId && (
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${canSubmit
                            ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/25'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {t.forms.processing}
                            </>
                        ) : (
                            <>
                                <Zap className="w-5 h-5" />
                                {t.dashboard.renewSubscription}
                            </>
                        )}
                    </button>
                )}
            </form>

            {/* Result Display */}
            {operationId && (
                <ResultDisplay
                    operationId={operationId}
                    onClose={handleClose}
                    onStatusChange={(status) => {
                        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
                            updateSession()
                        }
                    }}
                />
            )}
        </div>
    )
}
