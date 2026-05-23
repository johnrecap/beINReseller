'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    AlertCircle,
    CheckCircle2,
    Clock3,
    RefreshCw,
    Users,
    WalletCards,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type CreditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

type AgentDashboardData = {
    agent: {
        id: string
        username: string
        displayName: string
        defaultSourceGroup: string | null
        whapiGroupName: string | null
        whatsappNotificationsEnabled: boolean
        isConfigured: boolean
    }
    summary: {
        assignedUsers: number
        requestsToday: number
        pendingRequests: number
        approvedRequests: number
        pendingPoints: number
        availablePoints: number
    }
    assignedUsers: Array<{
        id: string
        username: string
        balance: number
        isActive: boolean
        sourceGroup: string
        assignedAt: string
        lastLoginAt: string | null
        lastRequestAt: string | null
        lastRequestStatus: CreditRequestStatus | null
    }>
    creditRequests: Array<{
        id: string
        requestNumber: string
        username: string
        amountUsd: number
        paymentMethod: string
        sourceGroup: string | null
        status: CreditRequestStatus
        createdAt: string
        decidedAt: string | null
    }>
}

function formatDate(value: string | null) {
    if (!value) return '-'
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function formatUsd(value: number) {
    return `USD ${value.toFixed(2)}`
}

function formatPoints(value: number) {
    return value.toLocaleString('en', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    })
}

function StatusBadge({ status }: { status: CreditRequestStatus | null }) {
    if (!status) {
        return <span className="text-xs text-muted-foreground">No requests</span>
    }

    const className = {
        PENDING: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
        APPROVED: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
        REJECTED: 'border-red-400/40 bg-red-400/10 text-red-300',
        CANCELLED: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
    }[status]

    return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{status}</span>
}

function SummaryCard({
    label,
    value,
    icon: Icon,
    tone,
}: {
    label: string
    value: string | number
    icon: typeof Users
    tone: string
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Icon className={`h-5 w-5 ${tone}`} />
            </div>
            <div className="mt-3 text-3xl font-bold text-foreground">{value}</div>
        </div>
    )
}

function EmptyState({ title }: { title: string }) {
    return (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-8 text-center text-emerald-200">
            {title}
        </div>
    )
}

export default function AgentDashboardClient() {
    const [data, setData] = useState<AgentDashboardData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/agent/dashboard', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)

            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load agent dashboard')
            }

            setData(payload)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load agent dashboard')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const summaryCards = useMemo(() => {
        if (!data) return []

        return [
            { label: 'Assigned Users', value: data.summary.assignedUsers, icon: Users, tone: 'text-sky-300' },
            { label: 'Requests Today', value: data.summary.requestsToday, icon: Clock3, tone: 'text-cyan-300' },
            { label: 'Pending Requests', value: data.summary.pendingRequests, icon: AlertCircle, tone: 'text-amber-300' },
            { label: 'Approved Requests', value: data.summary.approvedRequests, icon: CheckCircle2, tone: 'text-emerald-300' },
            { label: 'Pending Points', value: formatPoints(data.summary.pendingPoints), icon: WalletCards, tone: 'text-violet-300' },
            { label: 'Available Points', value: formatPoints(data.summary.availablePoints), icon: WalletCards, tone: 'text-lime-300' },
        ]
    }, [data])

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Read-only workspace</p>
                    <h1 className="text-3xl font-bold text-foreground">Agent Dashboard</h1>
                    {data && (
                        <p className="mt-2 text-sm text-muted-foreground">
                            {data.agent.displayName}
                            {data.agent.defaultSourceGroup ? ` - ${data.agent.defaultSourceGroup}` : ''}
                        </p>
                    )}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    onClick={loadData}
                    disabled={loading}
                    className="gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                    {error}
                </div>
            )}

            {loading && !data ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
                    Loading agent dashboard...
                </div>
            ) : data ? (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                        {summaryCards.map((card) => (
                            <SummaryCard key={card.label} {...card} />
                        ))}
                    </div>

                    <section className="rounded-lg border border-border bg-card">
                        <div className="border-b border-border p-4">
                            <h2 className="text-xl font-semibold text-foreground">Assigned Users</h2>
                            <p className="text-sm text-muted-foreground">Balances and latest request status only.</p>
                        </div>
                        {data.assignedUsers.length === 0 ? (
                            <div className="p-4">
                                <EmptyState title="No users are assigned to this agent yet." />
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">Username</th>
                                            <th className="px-4 py-3 text-left font-medium">Balance</th>
                                            <th className="px-4 py-3 text-left font-medium">Source Group</th>
                                            <th className="px-4 py-3 text-left font-medium">Status</th>
                                            <th className="px-4 py-3 text-left font-medium">Last Request</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.assignedUsers.map((item) => (
                                            <tr key={item.id} className="border-t border-border">
                                                <td className="px-4 py-3 font-semibold text-foreground">{item.username}</td>
                                                <td className="px-4 py-3 text-foreground">{formatUsd(item.balance)}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{item.sourceGroup}</td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={item.lastRequestStatus} />
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{formatDate(item.lastRequestAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-border bg-card">
                        <div className="border-b border-border p-4">
                            <h2 className="text-xl font-semibold text-foreground">Credit Requests</h2>
                            <p className="text-sm text-muted-foreground">Recent requests for assigned users. No actions are available here.</p>
                        </div>
                        {data.creditRequests.length === 0 ? (
                            <div className="p-4">
                                <EmptyState title="No credit requests found for your assigned users." />
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">Order ID</th>
                                            <th className="px-4 py-3 text-left font-medium">Username</th>
                                            <th className="px-4 py-3 text-left font-medium">Amount</th>
                                            <th className="px-4 py-3 text-left font-medium">Payment</th>
                                            <th className="px-4 py-3 text-left font-medium">Status</th>
                                            <th className="px-4 py-3 text-left font-medium">Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.creditRequests.map((item) => (
                                            <tr key={item.id} className="border-t border-border">
                                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.requestNumber}</td>
                                                <td className="px-4 py-3 font-semibold text-foreground">{item.username}</td>
                                                <td className="px-4 py-3 text-foreground">{formatUsd(item.amountUsd)}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{item.paymentMethod}</td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={item.status} />
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{formatDate(item.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            ) : null}
        </div>
    )
}
