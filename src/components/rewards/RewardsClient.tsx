'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'

type WalletData = {
    points: {
        available: number
        lifetimeEarned: number
        converted: number
        reversed: number
        legacy: number
    }
    conversion: {
        enabled: boolean
        points: number
        amountUsd: number
        disabledReason: string | null
    }
    recentConversions: Array<{
        id: string
        pointsConverted: number
        balanceAmountUsd: number
        requestedAt: string
        transactionId: string
    }>
}

function formatPoints(value: number) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function formatMoney(value: number) {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

export default function RewardsClient() {
    const [data, setData] = useState<WalletData | null>(null)
    const [points, setPoints] = useState('')
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/points/wallet', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load points wallet')
            }
            setData(payload)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load points wallet')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const pointsNumber = Number(points)
    const estimatedCredit = useMemo(() => {
        if (!data?.conversion.enabled || !Number.isFinite(pointsNumber) || pointsNumber <= 0) return 0
        return (pointsNumber / data.conversion.points) * data.conversion.amountUsd
    }, [data, pointsNumber])

    async function convertPoints() {
        setSubmitting(true)
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch('/api/points/cash-redemptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: pointsNumber }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to convert points')
            }
            setSuccess(`Converted ${formatPoints(payload.redemption.pointsConverted)} points to $${formatMoney(payload.redemption.balanceAmountUsd)} balance.`)
            setPoints('')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to convert points')
        } finally {
            setSubmitting(false)
        }
    }

    const canSubmit = Boolean(
        data?.conversion.enabled
        && Number.isFinite(pointsNumber)
        && pointsNumber > 0
        && pointsNumber <= (data?.points.available ?? 0)
        && !submitting
    )

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Points wallet</p>
                    <h1 className="text-3xl font-bold text-foreground">Rewards</h1>
                </div>
                <Button type="button" variant="outline" onClick={loadData} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                    {success}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Available Points</div>
                    <div className="mt-2 text-3xl font-bold">{formatPoints(data?.points.available || 0)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Lifetime Earned</div>
                    <div className="mt-2 text-3xl font-bold">{formatPoints(data?.points.lifetimeEarned || 0)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Converted</div>
                    <div className="mt-2 text-3xl font-bold">{formatPoints(data?.points.converted || 0)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Reversed</div>
                    <div className="mt-2 text-3xl font-bold">{formatPoints(data?.points.reversed || 0)}</div>
                </div>
            </div>

            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <WalletCards className="h-5 w-5" />
                    Convert Points
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                    <label className="space-y-2">
                        <span className="text-sm text-muted-foreground">Points to convert</span>
                        <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={points}
                            onChange={(event) => setPoints(event.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-purple-500"
                        />
                    </label>
                    <Button type="button" onClick={convertPoints} disabled={!canSubmit}>
                        Convert
                    </Button>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                    {data?.conversion.enabled
                        ? `${formatPoints(data.conversion.points)} points = $${formatMoney(data.conversion.amountUsd)}. Estimated credit: $${formatMoney(estimatedCredit)}`
                        : `Conversion unavailable: ${data?.conversion.disabledReason || 'settings disabled'}`
                    }
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xl font-semibold">Recent Conversions</h2>
                <div className="mt-4 space-y-3">
                    {data?.recentConversions.length === 0 && (
                        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                            No point conversions yet.
                        </div>
                    )}
                    {data?.recentConversions.map((conversion) => (
                        <div key={conversion.id} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                            <div>
                                <div className="font-semibold">${formatMoney(conversion.balanceAmountUsd)} credited</div>
                                <div className="text-xs text-muted-foreground">
                                    {new Date(conversion.requestedAt).toLocaleString()}
                                </div>
                            </div>
                            <span className="font-mono text-sm">{formatPoints(conversion.pointsConverted)} pts</span>
                            <span className="font-mono text-xs text-muted-foreground">{conversion.transactionId}</span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
