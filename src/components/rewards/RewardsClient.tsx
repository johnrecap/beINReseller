'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gift, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Reward = {
    id: string
    name: string
    description: string | null
    pointsCost: number
    fulfillmentNotes: string | null
    canRedeem: boolean
}

type Redemption = {
    id: string
    rewardName: string
    pointsCost: number
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    requestedAt: string
    decidedAt: string | null
    decisionNote: string | null
}

type RewardsData = {
    points: {
        pending: number
        available: number
        redeemed: number
        cancelled: number
    }
    rewards: Reward[]
    redemptions: Redemption[]
}

function formatPoints(value: number) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function statusVariant(status: Redemption['status']) {
    if (status === 'APPROVED') return 'success' as const
    if (status === 'PENDING') return 'warning' as const
    if (status === 'REJECTED' || status === 'CANCELLED') return 'destructive' as const
    return 'secondary' as const
}

export default function RewardsClient() {
    const [data, setData] = useState<RewardsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [redeemingId, setRedeemingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/rewards', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load rewards')
            }
            setData(payload)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load rewards')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    async function redeem(rewardId: string) {
        setRedeemingId(rewardId)
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch('/api/rewards/redemptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rewardId }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to request redemption')
            }
            setSuccess('Reward redemption request created.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to request redemption')
        } finally {
            setRedeemingId(null)
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Points rewards</p>
                    <h1 className="text-3xl font-bold text-foreground">Rewards</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Pending points must be released by admin before they can be redeemed.
                    </p>
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

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Available Points</div>
                    <div className="mt-2 text-3xl font-bold">{formatPoints(data?.points.available || 0)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Pending Points</div>
                    <div className="mt-2 text-3xl font-bold">{formatPoints(data?.points.pending || 0)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Redeemed Points</div>
                    <div className="mt-2 text-3xl font-bold">{formatPoints(data?.points.redeemed || 0)}</div>
                </div>
            </div>

            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <Gift className="h-5 w-5" />
                    Available Rewards
                </h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {data?.rewards.length === 0 && (
                        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                            No active rewards are available.
                        </div>
                    )}
                    {data?.rewards.map((reward) => (
                        <div key={reward.id} className="rounded-lg border border-border p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <h3 className="font-semibold">{reward.name}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{reward.description || 'No description'}</p>
                                </div>
                                <span className="font-mono text-sm">{formatPoints(reward.pointsCost)} pts</span>
                            </div>
                            {reward.fulfillmentNotes && (
                                <p className="mt-3 text-xs text-muted-foreground">{reward.fulfillmentNotes}</p>
                            )}
                            <div className="mt-4">
                                <Button
                                    type="button"
                                    disabled={!reward.canRedeem || redeemingId === reward.id}
                                    onClick={() => redeem(reward.id)}
                                >
                                    Request Redemption
                                </Button>
                                {!reward.canRedeem && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Not enough available points for this reward.
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xl font-semibold">My Redemptions</h2>
                <div className="mt-4 space-y-3">
                    {data?.redemptions.length === 0 && (
                        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                            No redemption requests yet.
                        </div>
                    )}
                    {data?.redemptions.map((redemption) => (
                        <div key={redemption.id} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                            <div>
                                <div className="font-semibold">{redemption.rewardName}</div>
                                <div className="text-xs text-muted-foreground">
                                    Requested {new Date(redemption.requestedAt).toLocaleString()}
                                </div>
                            </div>
                            <span className="font-mono text-sm">{formatPoints(redemption.pointsCost)} pts</span>
                            <Badge variant={statusVariant(redemption.status)}>{redemption.status}</Badge>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
