'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Gift, RefreshCw, RotateCcw, Save, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Reward = {
    id: string
    name: string
    description: string | null
    pointsCost: number
    isActive: boolean
    fulfillmentNotes: string | null
    redemptionsCount: number
    updatedAt: string
}

type Redemption = {
    id: string
    rewardName: string
    pointsCost: number
    ownerUserId: string
    ownerUsername: string
    ownerRole: string
    ownerAvailablePoints: number
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    requestedAt: string
    decidedAt: string | null
    decisionNote: string | null
}

type PendingPointOwner = {
    ownerUserId: string
    ownerUsername: string
    ownerRole: string
    pendingPoints: number
    pendingEntries: number
}

type RewardsData = {
    rewards: Reward[]
    redemptions: Redemption[]
    pendingPointOwners: PendingPointOwner[]
}

type RewardDraft = {
    id: string | null
    name: string
    description: string
    pointsCost: string
    fulfillmentNotes: string
    isActive: boolean
}

const emptyDraft: RewardDraft = {
    id: null,
    name: '',
    description: '',
    pointsCost: '',
    fulfillmentNotes: '',
    isActive: true,
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

export default function AdminRewardsClient() {
    const [data, setData] = useState<RewardsData | null>(null)
    const [draft, setDraft] = useState<RewardDraft>(emptyDraft)
    const [releaseNote, setReleaseNote] = useState('')
    const [decisionNote, setDecisionNote] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [actingId, setActingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const pendingRedemptions = useMemo(
        () => data?.redemptions.filter((redemption) => redemption.status === 'PENDING') || [],
        [data?.redemptions]
    )

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/admin/rewards', { cache: 'no-store' })
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

    function editReward(reward: Reward) {
        setDraft({
            id: reward.id,
            name: reward.name,
            description: reward.description || '',
            pointsCost: reward.pointsCost.toString(),
            fulfillmentNotes: reward.fulfillmentNotes || '',
            isActive: reward.isActive,
        })
    }

    async function saveReward(event: FormEvent) {
        event.preventDefault()
        setSaving(true)
        setError(null)
        setSuccess(null)

        try {
            const pointsCost = Number(draft.pointsCost)
            if (!Number.isFinite(pointsCost) || pointsCost <= 0) {
                throw new Error('Reward cost must be greater than zero')
            }

            const response = await fetch(draft.id ? `/api/admin/rewards/${draft.id}` : '/api/admin/rewards', {
                method: draft.id ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: draft.name,
                    description: draft.description,
                    pointsCost,
                    fulfillmentNotes: draft.fulfillmentNotes,
                    isActive: draft.isActive,
                }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to save reward')
            }

            setSuccess(draft.id ? 'Reward updated.' : 'Reward created.')
            setDraft(emptyDraft)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save reward')
        } finally {
            setSaving(false)
        }
    }

    async function releasePoints(ownerUserId: string) {
        setActingId(ownerUserId)
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch('/api/admin/points/release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ownerUserId, note: releaseNote }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to release points')
            }
            setSuccess(`Released ${formatPoints(payload.releasedPoints || 0)} points.`)
            setReleaseNote('')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to release points')
        } finally {
            setActingId(null)
        }
    }

    async function decideRedemption(redemptionId: string, decision: 'APPROVE' | 'REJECT') {
        setActingId(redemptionId)
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch(`/api/admin/rewards/redemptions/${redemptionId}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, note: decisionNote }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to decide redemption')
            }
            setSuccess(decision === 'APPROVE' ? 'Redemption approved.' : 'Redemption rejected.')
            setDecisionNote('')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to decide redemption')
        } finally {
            setActingId(null)
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Admin configuration</p>
                    <h1 className="text-3xl font-bold text-foreground">Rewards</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Release pending points, manage redeemable rewards, and approve point deductions.
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

            <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
                <form className="rounded-lg border border-border bg-card p-4" onSubmit={saveReward}>
                    <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <Gift className="h-5 w-5" />
                        {draft.id ? 'Edit Reward' : 'Create Reward'}
                    </h2>
                    <div className="mt-4 space-y-4">
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Reward name</span>
                            <Input
                                value={draft.name}
                                onChange={(event) => setDraft((item) => ({ ...item, name: event.target.value }))}
                                required
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Points cost</span>
                            <Input
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                value={draft.pointsCost}
                                onChange={(event) => setDraft((item) => ({ ...item, pointsCost: event.target.value }))}
                                required
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Description</span>
                            <textarea
                                className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                                value={draft.description}
                                onChange={(event) => setDraft((item) => ({ ...item, description: event.target.value }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Fulfillment notes</span>
                            <textarea
                                className="min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                                value={draft.fulfillmentNotes}
                                onChange={(event) => setDraft((item) => ({ ...item, fulfillmentNotes: event.target.value }))}
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={draft.isActive}
                                onChange={(event) => setDraft((item) => ({ ...item, isActive: event.target.checked }))}
                            />
                            Active reward
                        </label>
                        <div className="flex gap-2">
                            <Button type="submit" disabled={saving} className="gap-2">
                                <Save className="h-4 w-4" />
                                Save Reward
                            </Button>
                            {draft.id && (
                                <Button type="button" variant="outline" onClick={() => setDraft(emptyDraft)}>
                                    Cancel Edit
                                </Button>
                            )}
                        </div>
                    </div>
                </form>

                <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-xl font-semibold">Pending Points Release</h2>
                    <div className="mt-3">
                        <Input
                            placeholder="Release note"
                            value={releaseNote}
                            onChange={(event) => setReleaseNote(event.target.value)}
                        />
                    </div>
                    <div className="mt-4 space-y-3">
                        {data?.pendingPointOwners.length === 0 && (
                            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                                No pending points to release.
                            </div>
                        )}
                        {data?.pendingPointOwners.map((owner) => (
                            <div key={owner.ownerUserId} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto] md:items-center">
                                <div>
                                    <div className="font-semibold">{owner.ownerUsername}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {owner.ownerRole} - {owner.pendingEntries} entries
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-sm">{formatPoints(owner.pendingPoints)} pts</span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={actingId === owner.ownerUserId}
                                        onClick={() => releasePoints(owner.ownerUserId)}
                                        className="gap-2"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        Release
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xl font-semibold">Rewards Catalog</h2>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {data?.rewards.length === 0 && (
                        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                            No rewards configured.
                        </div>
                    )}
                    {data?.rewards.map((reward) => (
                        <div key={reward.id} className="rounded-lg border border-border p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold">{reward.name}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{reward.description || 'No description'}</p>
                                </div>
                                <Badge variant={reward.isActive ? 'success' : 'secondary'}>
                                    {reward.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <span className="font-mono text-sm">{formatPoints(reward.pointsCost)} pts</span>
                                <Button type="button" size="sm" variant="outline" onClick={() => editReward(reward)}>
                                    Edit
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xl font-semibold">Redemption Review</h2>
                <div className="mt-3">
                    <Input
                        placeholder="Decision note"
                        value={decisionNote}
                        onChange={(event) => setDecisionNote(event.target.value)}
                    />
                </div>
                <div className="mt-4 space-y-3">
                    {pendingRedemptions.length === 0 && (
                        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                            No pending redemption requests.
                        </div>
                    )}
                    {pendingRedemptions.map((redemption) => (
                        <div key={redemption.id} className="grid gap-4 rounded-lg border border-border p-4 xl:grid-cols-[1.2fr_1fr_auto] xl:items-center">
                            <div>
                                <div className="font-semibold">{redemption.rewardName}</div>
                                <div className="text-sm text-muted-foreground">
                                    {redemption.ownerUsername} - {redemption.ownerRole}
                                </div>
                            </div>
                            <div className="grid gap-2 text-sm sm:grid-cols-3">
                                <div>
                                    <div className="text-muted-foreground">Cost</div>
                                    <div className="font-mono">{formatPoints(redemption.pointsCost)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Available</div>
                                    <div className="font-mono">{formatPoints(redemption.ownerAvailablePoints)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Status</div>
                                    <Badge variant={statusVariant(redemption.status)}>{redemption.status}</Badge>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={actingId === redemption.id}
                                    onClick={() => decideRedemption(redemption.id, 'APPROVE')}
                                    className="gap-2"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Approve
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="danger"
                                    disabled={actingId === redemption.id}
                                    onClick={() => decideRedemption(redemption.id, 'REJECT')}
                                    className="gap-2"
                                >
                                    <XCircle className="h-4 w-4" />
                                    Reject
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
