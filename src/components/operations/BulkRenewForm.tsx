'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { MIN_BALANCE_WARNING, DURATION_OPTIONS } from '@/lib/constants'
import { usePrices } from '@/hooks/usePrices'
import { useTranslation } from '@/hooks/useTranslation'

interface OperationResult {
    cardNumber: string
    operationId: string
    status: 'pending' | 'success' | 'error'
    error?: string
}

export default function BulkRenewForm() {
    const { data: session, update: updateSession } = useSession()
    const { getPrice, loading: pricesLoading } = usePrices()
    const { t } = useTranslation()
    const [cardNumbers, setCardNumbers] = useState('')
    const [duration, setDuration] = useState('1_month')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [results, setResults] = useState<OperationResult[] | null>(null)
    const [blockedCards, setBlockedCards] = useState<string[]>([])

    const priceKey = `RENEW_${duration.toUpperCase()}` as 'RENEW_1_MONTH' | 'RENEW_3_MONTHS' | 'RENEW_6_MONTHS' | 'RENEW_1_YEAR'
    const pricePerCard = getPrice(priceKey)
    const cards = cardNumbers.split('\n').map(c => c.trim()).filter(c => c.length >= 10)
    const totalPrice = pricePerCard * cards.length
    const balance = session?.user?.balance || 0
    const canSubmit = cards.length > 0 && cards.length <= 10 && balance >= totalPrice && !loading && !pricesLoading

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
                setError(data.error || t.common.error)
                if (data.blockedCards) {
                    setBlockedCards(data.blockedCards)
                }
                return
            }

            // Set results
            const operationResults: OperationResult[] = data.operations.map((op: { cardNumber: string; operationId: string }) => ({
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
            setError(t.common.error)
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
        <div className="bg-card rounded-2xl shadow-lg p-6">
            {/* Low Balance Warning */}
            {balance < MIN_BALANCE_WARNING && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                    ⚠️ {t.forms.lowBalanceWarning} ({balance} {t.header.currency})
                </div>
            )}

            {!results ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Card Numbers Textarea */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            {t.forms.enterCards}
                        </label>
                        <textarea
                            value={cardNumbers}
                            onChange={(e) => setCardNumbers(e.target.value)}
                            placeholder={t.forms.enterCardsPlaceholder}
                            rows={6}
                            className="w-full px-4 py-3 border-2 border-border rounded-xl focus:border-amber-500 focus:outline-none transition-colors text-left dir-ltr font-mono bg-background text-foreground"
                            disabled={loading}
                        />
                        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                            <span>{cards.length} {t.forms.cardCount}</span>
                            <span>{t.forms.max10}</span>
                        </div>
                        {cards.length > 10 && (
                            <p className="text-xs text-red-500 mt-1">{t.forms.max10CardsError}</p>
                        )}
                    </div>

                    {/* Duration Select */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            {t.forms.renewDuration}
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
                                        : 'border-border hover:border-amber-300'
                                        }`}
                                >
                                    <div className="font-bold">
                                        {(t.forms as Record<string, string>)[`duration_${option.value}`] || option.label}
                                    </div>
                                    <div className="text-sm text-amber-600">
                                        {option.price} {t.header.currency}/{t.forms.perCard}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Price Summary */}
                    <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-xl p-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t.forms.totalCards}:</span>
                                <span className="font-bold">{cards.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t.forms.price}:</span>
                                <span className="font-bold">{pricePerCard} {t.header.currency}</span>
                            </div>
                        </div>
                        <div className="border-t border-amber-200 mt-3 pt-3">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">{t.forms.totalPrice}:</span>
                                <span className="text-2xl font-bold text-amber-700">{totalPrice} {t.header.currency}</span>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-sm">
                                <span className="text-gray-500">{t.forms.yourBalance}:</span>
                                <span className={balance >= totalPrice ? 'text-green-600' : 'text-red-600'}>
                                    {balance} {t.header.currency}
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
                            <p className="font-bold mb-2">⚠️ {t.forms.blockedCardsWarning}</p>
                            <ul className="list-disc list-inside">
                                {blockedCards.map(card => (
                                    <li key={card} className="font-mono">{card}</li>
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
                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                            }`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {t.forms.processing}
                            </>
                        ) : (
                            <>
                                {t.forms.submit} {cards.length} {t.forms.cardCount}
                            </>
                        )}
                    </button>
                </form>
            ) : (
                /* Results Display */
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-foreground">{t.forms.resultsTitle}</h3>

                    {/* Results List */}
                    <div className="space-y-2">
                        {results.map((result, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-secondary rounded-lg"
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
                                    <span className="font-mono">{result.cardNumber}</span>
                                </div>
                                <span className="text-sm text-muted-foreground">
                                    {result.status === 'pending' && t.resultDisplay.status.PENDING}
                                    {result.status === 'success' && t.resultDisplay.status.COMPLETED}
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
                                <span className="font-bold">
                                    {t.forms.skippedCards.replace('{{count}}', blockedCards.length.toString())}
                                </span>
                            </div>
                            <p className="text-xs">{t.forms.skippedCardsNote}</p>
                        </div>
                    )}

                    {/* Reset Button */}
                    <button
                        onClick={handleReset}
                        className="w-full py-3 bg-secondary text-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all"
                    >
                        {t.forms.newOperation}
                    </button>
                </div>
            )}
        </div>
    )
}
