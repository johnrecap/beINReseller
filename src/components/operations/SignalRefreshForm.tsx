'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Radio, Loader2 } from 'lucide-react'
import { OPERATION_PRICES, MIN_BALANCE_WARNING } from '@/lib/constants'
import ResultDisplay from './ResultDisplay'

export default function SignalRefreshForm() {
    const { data: session, update: updateSession } = useSession()
    const [cardNumber, setCardNumber] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [operationId, setOperationId] = useState<string | null>(null)

    const price = OPERATION_PRICES.SIGNAL_REFRESH
    const balance = session?.user?.balance || 0
    const canSubmit = cardNumber.length >= 10 && balance >= price && !loading

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
                    type: 'SIGNAL_REFRESH',
                    cardNumber,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'حدث خطأ')
                return
            }

            setOperationId(data.operationId)
            await updateSession()
        } catch (err) {
            setError('فشل في إرسال الطلب')
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setOperationId(null)
        setCardNumber('')
    }

    return (
        <div className="relative">
            {/* Low Balance Warning */}
            {balance < MIN_BALANCE_WARNING && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                    ⚠️ رصيدك منخفض ({balance} ريال). يرجى شحن الرصيد لإجراء العمليات.
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Card Number Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        رقم الكارت
                    </label>
                    <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                        placeholder="أدخل رقم الكارت لتنشيط الإشارة"
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-colors text-left dir-ltr font-mono"
                        disabled={loading || !!operationId}
                    />
                </div>

                {/* Price Info */}
                <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-4">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">تكلفة تنشيط الإشارة:</span>
                        <span className="text-xl font-bold text-green-700">{price} ريال</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 text-sm">
                        <span className="text-gray-500">رصيدك الحالي:</span>
                        <span className={balance >= price ? 'text-green-600' : 'text-red-600'}>
                            {balance} ريال
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
                                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-lg shadow-green-500/25'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                جاري التنشيط...
                            </>
                        ) : (
                            <>
                                <Radio className="w-5 h-5" />
                                تنشيط الإشارة
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
