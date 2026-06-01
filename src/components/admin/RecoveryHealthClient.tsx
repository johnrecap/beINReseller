'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react'

type RecoveryHealth = {
    status: 'healthy' | 'degraded' | 'stale'
    staleRunner: boolean
    secondsSinceLastCycle: number | null
    lastCycle: {
        status: string
        finishedAt: string
        durationMs: number
        inspected: number
        changed: number
        skipped: number
        retried: number
        reviewRequired: number
        refunded: number
        errors: string[]
    } | null
    counts: {
        waitingExpired: number
        completingStuck: number
        processingStuck: number
        reviewRequired: number
        pendingDispatch: number
        exhaustedDispatch: number
    }
    recentDecisions: Array<{
        id: string
        operationId: string | null
        createdAt: string
        details: unknown
    }>
    error?: string
}

function formatAge(seconds: number | null) {
    if (seconds === null) return 'No cycle recorded'
    if (seconds < 60) return `${seconds}s ago`
    return `${Math.floor(seconds / 60)}m ago`
}

function detailText(details: unknown) {
    if (!details || typeof details !== 'object') return '-'
    const record = details as Record<string, unknown>
    const decision = typeof record.decision === 'string' ? record.decision : 'decision'
    const reason = typeof record.reason === 'string' ? record.reason : 'no reason'
    return `${decision}: ${reason}`
}

export default function RecoveryHealthClient() {
    const [data, setData] = useState<RecoveryHealth | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchHealth = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/admin/recovery-health', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok || !payload) throw new Error(payload?.error || 'Failed to load recovery health')
            setData(payload)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load recovery health')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchHealth()
    }, [fetchHealth])

    const statusView = useMemo(() => {
        if (!data) return { label: 'Loading', tone: 'text-muted-foreground', icon: Clock3 }
        if (data.status === 'healthy') return { label: 'Healthy', tone: 'text-emerald-300', icon: CheckCircle2 }
        if (data.status === 'stale') return { label: 'Stale runner', tone: 'text-red-300', icon: ShieldAlert }
        return { label: 'Degraded', tone: 'text-amber-300', icon: AlertTriangle }
    }, [data])

    const StatusIcon = statusView.icon

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className={`inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm ${statusView.tone}`}>
                            <StatusIcon className="h-4 w-4" />
                            {statusView.label}
                        </div>
                        <h1 className="mt-3 text-3xl font-bold text-foreground">Recovery Health</h1>
                        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                            Tracks 30s package windows, 10s confirmation windows, 5s heartbeat exits, dispatch recovery, and review visibility.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/dashboard/admin/financial-review"
                            className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
                        >
                            Open financial review
                        </Link>
                        <button
                            onClick={fetchHealth}
                            disabled={loading}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                        {error}
                    </div>
                )}

                <section className="grid gap-3 md:grid-cols-3">
                    <MetricCard label="Last cycle" value={formatAge(data?.secondsSinceLastCycle ?? null)} />
                    <MetricCard label="Cycle duration" value={data?.lastCycle ? `${data.lastCycle.durationMs}ms` : '-'} />
                    <MetricCard label="Review required" value={data?.counts.reviewRequired ?? 0} tone="text-amber-300" />
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                    <MetricCard label="Timed out before Pay" value={data?.counts.waitingExpired ?? 0} />
                    <MetricCard label="Stuck completing" value={data?.counts.completingStuck ?? 0} tone="text-red-300" />
                    <MetricCard label="Stuck processing" value={data?.counts.processingStuck ?? 0} />
                    <MetricCard label="Pending dispatch" value={data?.counts.pendingDispatch ?? 0} />
                    <MetricCard label="Exhausted dispatch" value={data?.counts.exhaustedDispatch ?? 0} tone="text-red-300" />
                    <MetricCard label="Last refunded" value={data?.lastCycle?.refunded ?? 0} tone="text-emerald-300" />
                </section>

                <section className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border p-4">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Last cycle summary</h2>
                            <p className="text-sm text-muted-foreground">
                                Last maintenance run result without sensitive data.
                            </p>
                        </div>
                        <RotateCcw className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="grid gap-3 p-4 md:grid-cols-5">
                        <MetricCard compact label="Inspected" value={data?.lastCycle?.inspected ?? 0} />
                        <MetricCard compact label="Changed" value={data?.lastCycle?.changed ?? 0} />
                        <MetricCard compact label="Skipped" value={data?.lastCycle?.skipped ?? 0} />
                        <MetricCard compact label="Retried" value={data?.lastCycle?.retried ?? 0} />
                        <MetricCard compact label="Errors" value={data?.lastCycle?.errors.length ?? 0} tone="text-red-300" />
                    </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                    <div className="border-b border-border p-4">
                        <h2 className="text-lg font-semibold text-foreground">Recent recovery decisions</h2>
                    </div>
                    <div className="divide-y divide-border">
                        {data?.recentDecisions.length ? data.recentDecisions.map((item) => (
                            <div key={item.id} className="grid gap-2 p-4 text-sm md:grid-cols-[180px_1fr_220px]">
                                <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
                                <span className="text-foreground">{detailText(item.details)}</span>
                                <span className="font-mono text-xs text-muted-foreground">{item.operationId || '-'}</span>
                            </div>
                        )) : (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                                No recent recovery decisions.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}

function MetricCard({
    label,
    value,
    tone = 'text-foreground',
    compact = false,
}: {
    label: string
    value: string | number
    tone?: string
    compact?: boolean
}) {
    return (
        <div className={`rounded-lg border border-border bg-card ${compact ? 'p-3' : 'p-4'}`}>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className={`mt-2 font-bold ${compact ? 'text-xl' : 'text-3xl'} ${tone}`}>{value}</div>
        </div>
    )
}
