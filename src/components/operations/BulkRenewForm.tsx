'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { DURATION_OPTIONS, getOperationPrice, MIN_BALANCE_WARNING } from '@/lib/constants'

interface OperationResult {
    cardNumber: string
    operationId: string
    status: 'pending' | 'success' | 'error'
    error?: string
}

export default function BulkRenewForm() {
    const { data: session, update: updateSession } = useSession()
    const [cardNumbers, setCardNumbers] = useState('')
    const [duration, setDuration] = useState('1_month')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [results, setResults] = useState<OperationResult[] | null>(null)
    const [blockedCards, setBlockedCards] = useState<string[]>([])

    const pricePerCard = getOperationPrice('RENEW', duration)
    const cards = cardNumbers.split('\n').map(c => c.trim()).filter(c => c.length >= 10)
    const totalPrice = pricePerCard * cards.length
    const balance = session?.user?.balance || 0
    const canSubmit = cards.length > 0 && cards.length <= 10 && balance >= totalPrice && !loading

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return

        setLoading(true)
        setError(null)
        setResults(null)
        setBlockedCards([])

        try {
            const res = await fetch('/api/operations/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'RENEW',
                    cardNumbers: cards,
                    duration,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'حدث خطأ')
                if (data.blockedCards) {
                    setBlockedCards(data.blockedCards)
                }
                return
            }

            // Set results
            const operationResults: OperationResult[] = data.operations.map((op: any) => ({
                cardNumber: op.cardNumber,
                operationId: op.operationId,
                status: 'pending',
            }))
            setResults(operationResults)

            if (data.blockedCards) {
                setBlockedCards(data.blockedCards)
            }

            // Update session
            await updateSession()
        } catch (err) {
            setError('فشل في إرسال الطلب')
        } finally {
            setLoading(false)
        }
    }

    const handleReset = () => {
        setCardNumbers('')
        setDuration('1_month')
        setResults(null)
        setBlockedCards([])
        setError(null)
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg p-6">
            {/* Low Balance Warning */}
            {balance < MIN_BALANCE_WARNING && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                    ⚠️ رصيدك منخفض ({balance} ريال). يرجى شحن الرصيد.
                </div>
            )}

            {!results ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Card Numbers Textarea */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            أرقام الكروت (رقم واحد في كل سطر)
                        </label>
                        <textarea
                            value={cardNumbers}
                            onChange={(e) => setCardNumbers(e.target.value)}
                            placeholder={`مثال:\n1234567890\n0987654321\n5555666677`}
                            rows={6}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none transition-colors text-left dir-ltr font-mono"
                            disabled={loading}
                        />
                        <div className="flex justify-between mt-2 text-xs text-gray-500">
                            <span>{cards.length} كارت</span>
                            <span>الحد الأقصى: 10</span>
                        </div>
                        {cards.length > 10 && (
                            <p className="text-xs text-red-500 mt-1">الحد الأقصى 10 كروت في الطلب الواحد</p>
                        )}
                    </div>

                    {/* Duration Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            مدة التجديد (لجميع الكروت)
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {DURATION_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setDuration(option.value)}
                                    disabled={loading}
                                    className={`p-4 rounded-xl border-2 transition-all text-right ${duration === option.value
                                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                                            : 'border-gray-200 hover:border-amber-300'
                                        }`}
                                >
                                    <div className="font-bold">{option.label}</div>
                                    <div className="text-sm text-amber-600">{option.price} ريال/كارت</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Price Summary */}
                    <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-xl p-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">عدد الكروت:</span>
                                <span className="font-bold">{cards.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">سعر الكارت:</span>
                                <span className="font-bold">{pricePerCard} ريال</span>
                            </div>
                        </div>
                        <div className="border-t border-amber-200 mt-3 pt-3">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">الإجمالي:</span>
                                <span className="text-2xl font-bold text-amber-700">{totalPrice} ريال</span>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-sm">
                                <span className="text-gray-500">رصيدك:</span>
                                <span className={balance >= totalPrice ? 'text-green-600' : 'text-red-600'}>
                                    {balance} ريال
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                            ❌ {error}
                        </div>
                    )}

                    {/* Blocked Cards Warning */}
                    {blockedCards.length > 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                            <p className="font-bold mb-2">⚠️ الكروت التالية لديها عمليات جارية:</p>
                            <ul className="list-disc list-inside">
                                {blockedCards.map(card => (
                                    <li key={card} className="font-mono">****{card.slice(-4)}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${canSubmit
                                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/25'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                جاري الإرسال...
                            </>
                        ) : (
                            <>
                                تجديد {cards.length} كارت
                            </>
                        )}
                    </button>
                </form>
            ) : (
                /* Results Display */
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-800">نتائج العمليات</h3>

                    {/* Results List */}
                    <div className="space-y-2">
                        {results.map((result, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    {result.status === 'pending' && (
                                        <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                                    )}
                                    {result.status === 'success' && (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    )}
                                    {result.status === 'error' && (
                                        <XCircle className="w-5 h-5 text-red-500" />
                                    )}
                                    <span className="font-mono">****{result.cardNumber.slice(-4)}</span>
                                </div>
                                <span className="text-sm text-gray-500">
                                    {result.status === 'pending' && 'قيد التنفيذ'}
                                    {result.status === 'success' && 'تم بنجاح'}
                                    {result.status === 'error' && result.error}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Blocked Cards */}
                    {blockedCards.length > 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="w-5 h-5" />
                                <span className="font-bold">تم تخطي {blockedCards.length} كارت</span>
                            </div>
                            <p className="text-xs">هذه الكروت لديها عمليات جارية بالفعل</p>
                        </div>
                    )}

                    {/* Reset Button */}
                    <button
                        onClick={handleReset}
                        className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all"
                    >
                        عملية جديدة
                    </button>
                </div>
            )}
        </div>
    )
}
