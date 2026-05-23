'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
    AlertCircle,
    CheckCircle2,
    Clock3,
    Copy,
    ExternalLink,
    Flag,
    MessageCircle,
    RefreshCw,
    Search,
    XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type CreditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
type Decision = 'APPROVE' | 'REJECT' | 'CANCEL'
type EscalationAction = 'ESCALATE' | 'RESOLVE'

type AdminCreditRequestItem = {
    id: string
    requestNumber: string
    username: string
    user: {
        id: string
        username: string
        balance: number
        isActive: boolean
    }
    amountUsd: number
    paymentMethod: string
    notes: string | null
    agentId: string | null
    agentName: string | null
    sourceGroup: string | null
    status: CreditRequestStatus
    escalated: boolean
    escalationNote: string | null
    createdAt: string
    decidedAt: string | null
    decidedByAdmin: { id: string; username: string } | null
    decisionNote: string | null
    transactionId: string | null
    notification: {
        provider: string
        targetType: string
        status: 'PENDING' | 'SENT' | 'FAILED' | 'DISABLED'
        targetId: string | null
        targetLabel: string | null
        error: string | null
        lastAttemptAt: string | null
        retryAvailable?: boolean
    } | null
    whatsappHandoff: WhatsAppHandoff | null
    pointsPreview: {
        user: { points: number; ratePerThousandSnapshot: number }
        agent: { points: number; ratePerThousandSnapshot: number }
    }
}

type ApiResponse = {
    summary: Partial<Record<CreditRequestStatus, number>>
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
    filters: {
        agents: Array<{ id: string; name: string; username: string }>
        sourceGroups: string[]
    }
    items: AdminCreditRequestItem[]
}

type DialogState = {
    item: AdminCreditRequestItem
    decision: Decision
} | null

type EscalationDialogState = {
    item: AdminCreditRequestItem
    action: EscalationAction
} | null

type WhatsAppHandoff = {
    id: string
    destinationLabel: string | null
    groupUrl: string | null
    phone: string | null
    phoneUrl?: string | null
    messageText: string
    groupOpenAvailable: boolean
    phoneOpenAvailable: boolean
    createdAt: string
}

const statusOptions: Array<{ value: CreditRequestStatus | 'ALL'; label: string }> = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'ALL', label: 'All' },
]

const escalationOptions: Array<{ value: 'ALL' | 'ESCALATED' | 'NORMAL'; label: string }> = [
    { value: 'ALL', label: 'All escalation states' },
    { value: 'ESCALATED', label: 'Escalated only' },
    { value: 'NORMAL', label: 'Not escalated' },
]

const decisionCopy: Record<Decision, { title: string; body: string; confirm: string; tone: string }> = {
    APPROVE: {
        title: 'Approve Credit Request',
        body: 'This will add balance to the user and create pending points once. Duplicate approval is blocked server-side.',
        confirm: 'Approve and Add Balance',
        tone: 'text-emerald-300',
    },
    REJECT: {
        title: 'Reject Credit Request',
        body: 'This changes the request status only. No balance or points will be created.',
        confirm: 'Reject Request',
        tone: 'text-red-300',
    },
    CANCEL: {
        title: 'Cancel Credit Request',
        body: 'This cancels the pending request without changing balance or points.',
        confirm: 'Cancel Request',
        tone: 'text-amber-300',
    },
}

const escalationCopy: Record<EscalationAction, { title: string; body: string; confirm: string; tone: string }> = {
    ESCALATE: {
        title: 'Escalate Credit Request',
        body: 'This marks the request for admin attention. It does not approve, reject, cancel, add balance, or change points.',
        confirm: 'Escalate Request',
        tone: 'text-amber-300',
    },
    RESOLVE: {
        title: 'Resolve Escalation',
        body: 'This removes the escalation flag only. The request status, balance, and points remain unchanged.',
        confirm: 'Resolve Escalation',
        tone: 'text-emerald-300',
    },
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

function StatusBadge({ status }: { status: CreditRequestStatus }) {
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
    value: number
    icon: typeof Clock3
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

export default function AdminCreditRequestsClient() {
    const [status, setStatus] = useState<CreditRequestStatus | 'ALL'>('PENDING')
    const [agentId, setAgentId] = useState('')
    const [sourceGroup, setSourceGroup] = useState('')
    const [escalationFilter, setEscalationFilter] = useState<'ALL' | 'ESCALATED' | 'NORMAL'>('ALL')
    const [search, setSearch] = useState('')
    const [data, setData] = useState<ApiResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dialog, setDialog] = useState<DialogState>(null)
    const [escalationDialog, setEscalationDialog] = useState<EscalationDialogState>(null)
    const [handoffResult, setHandoffResult] = useState<WhatsAppHandoff | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    const queryString = useMemo(() => {
        const params = new URLSearchParams({ page: '1', limit: '25' })
        if (status !== 'ALL') params.set('status', status)
        if (agentId) params.set('agentId', agentId)
        if (sourceGroup) params.set('sourceGroup', sourceGroup)
        if (escalationFilter === 'ESCALATED') params.set('escalated', 'true')
        if (escalationFilter === 'NORMAL') params.set('escalated', 'false')
        if (search.trim()) params.set('search', search.trim())
        return params.toString()
    }, [agentId, escalationFilter, search, sourceGroup, status])

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/admin/credit-requests?${queryString}`, { cache: 'no-store' })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Failed to load credit requests')
            setData(payload)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load credit requests')
        } finally {
            setLoading(false)
        }
    }, [queryString])

    useEffect(() => {
        void loadData()
    }, [loadData])

    async function submitDecision(note: string) {
        if (!dialog) return
        setBusyId(dialog.item.id)
        setError(null)
        try {
            const response = await fetch(`/api/admin/credit-requests/${dialog.item.id}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision: dialog.decision, note }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || 'Failed to save decision')
            if (payload.whatsappHandoff) {
                setHandoffResult(payload.whatsappHandoff)
            }
            setDialog(null)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save decision')
        } finally {
            setBusyId(null)
        }
    }

    async function submitEscalation(note: string) {
        if (!escalationDialog) return
        setBusyId(escalationDialog.item.id)
        setError(null)
        try {
            const response = await fetch(`/api/admin/credit-requests/${escalationDialog.item.id}/escalate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: escalationDialog.action, note }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || 'Failed to save escalation')
            setEscalationDialog(null)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save escalation')
        } finally {
            setBusyId(null)
        }
    }

    async function retryNotification(item: AdminCreditRequestItem) {
        setBusyId(item.id)
        setError(null)
        try {
            const response = await fetch(`/api/admin/credit-requests/${item.id}/notification-retry`, {
                method: 'POST',
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || 'Failed to retry Telegram notification')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to retry Telegram notification')
        } finally {
            setBusyId(null)
        }
    }

    function handleSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        void loadData()
    }

    return (
        <div className="min-h-screen bg-background p-6" dir="rtl">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
                            <AlertCircle className="h-4 w-4" />
                            Credit approval changes balance only after admin action
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Credit Requests</h1>
                            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                                Review agent-linked user credit requests. Approval creates one deposit and pending point entries.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={() => void loadData()} loading={loading}>
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </Button>
                </header>

                <section className="grid gap-3 md:grid-cols-4">
                    <SummaryCard label="Pending" value={data?.summary.PENDING || 0} icon={Clock3} tone="text-amber-300" />
                    <SummaryCard label="Approved" value={data?.summary.APPROVED || 0} icon={CheckCircle2} tone="text-emerald-300" />
                    <SummaryCard label="Rejected" value={data?.summary.REJECTED || 0} icon={XCircle} tone="text-red-300" />
                    <SummaryCard label="Cancelled" value={data?.summary.CANCELLED || 0} icon={AlertCircle} tone="text-slate-300" />
                </section>

                <form onSubmit={handleSearch} className="rounded-lg border border-border bg-card p-4">
                    <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_180px_180px_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search username, order id, agent, payment"
                                className="pr-10"
                            />
                        </div>
                        <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value as CreditRequestStatus | 'ALL')}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select
                            value={agentId}
                            onChange={(event) => setAgentId(event.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            <option value="">All agents</option>
                            {(data?.filters.agents || []).map((agent) => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                        </select>
                        <select
                            value={sourceGroup}
                            onChange={(event) => setSourceGroup(event.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            <option value="">All groups</option>
                            {(data?.filters.sourceGroups || []).map((group) => (
                                <option key={group} value={group}>{group}</option>
                            ))}
                        </select>
                        <select
                            value={escalationFilter}
                            onChange={(event) => setEscalationFilter(event.target.value as 'ALL' | 'ESCALATED' | 'NORMAL')}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            {escalationOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <Button type="submit" loading={loading}>Search</Button>
                    </div>
                </form>

                {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                        {error}
                    </div>
                )}

                <section className="rounded-lg border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-secondary/60 text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-3 text-start">Order ID</th>
                                    <th className="px-3 py-3 text-start">User</th>
                                    <th className="px-3 py-3 text-start">Amount</th>
                                    <th className="px-3 py-3 text-start">Payment</th>
                                    <th className="px-3 py-3 text-start">Agent</th>
                                    <th className="px-3 py-3 text-start">Notification</th>
                                    <th className="px-3 py-3 text-start">Points Preview</th>
                                    <th className="px-3 py-3 text-start">Status</th>
                                    <th className="px-3 py-3 text-start">Created</th>
                                    <th className="px-3 py-3 text-start">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Loading...</td>
                                    </tr>
                                ) : data?.items.length ? (
                                    data.items.map((item) => (
                                        <tr key={item.id} className="border-b border-border/60 align-top">
                                            <td className="px-3 py-3">
                                                <div className="font-mono text-xs text-foreground">{item.requestNumber}</div>
                                                {item.notes && <div className="mt-1 max-w-[220px] text-xs text-muted-foreground">{item.notes}</div>}
                                                {item.escalated && (
                                                    <div className="mt-2 flex max-w-[240px] items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
                                                        <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                        <span>{item.escalationNote || 'Escalated for admin attention'}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="font-semibold text-foreground">{item.username}</div>
                                                <div className="text-xs text-muted-foreground">Balance: {formatUsd(item.user.balance)}</div>
                                            </td>
                                            <td className="px-3 py-3 font-semibold text-foreground">{formatUsd(item.amountUsd)}</td>
                                            <td className="px-3 py-3 text-foreground">{item.paymentMethod}</td>
                                            <td className="px-3 py-3">
                                                <div className="text-foreground">{item.agentName || '-'}</div>
                                                <div className="text-xs text-muted-foreground">{item.sourceGroup || '-'}</div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="text-foreground">{item.notification?.status || '-'}</div>
                                                <div className="max-w-[180px] text-xs text-muted-foreground">{item.notification?.targetLabel || item.notification?.error || '-'}</div>
                                                {item.notification?.retryAvailable && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="mt-2"
                                                        onClick={() => void retryNotification(item)}
                                                        loading={busyId === item.id}
                                                    >
                                                        <RefreshCw className="h-3.5 w-3.5" />
                                                        Retry
                                                    </Button>
                                                )}
                                                {item.whatsappHandoff && (
                                                    <button
                                                        type="button"
                                                        className="mt-2 text-xs text-sky-300 underline"
                                                        onClick={() => setHandoffResult(item.whatsappHandoff)}
                                                    >
                                                        WhatsApp handoff
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-xs text-muted-foreground">
                                                <div>User: {item.pointsPreview.user.points}</div>
                                                <div>Agent: {item.pointsPreview.agent.points}</div>
                                            </td>
                                            <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                                            <td className="px-3 py-3 text-muted-foreground">{formatDate(item.createdAt)}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex min-w-[260px] flex-wrap gap-2">
                                                    {item.status === 'PENDING' ? (
                                                        <>
                                                            <Button size="sm" onClick={() => setDialog({ item, decision: 'APPROVE' })} disabled={busyId === item.id}>
                                                                Approve
                                                            </Button>
                                                            <Button size="sm" variant="danger" onClick={() => setDialog({ item, decision: 'REJECT' })} disabled={busyId === item.id}>
                                                                Reject
                                                            </Button>
                                                            <Button size="sm" variant="outline" onClick={() => setDialog({ item, decision: 'CANCEL' })} disabled={busyId === item.id}>
                                                                Cancel
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <div className="basis-full text-xs text-muted-foreground">
                                                            {item.decisionNote || 'Decision saved'}
                                                        </div>
                                                    )}
                                                    {item.escalated ? (
                                                        <Button size="sm" variant="outline" onClick={() => setEscalationDialog({ item, action: 'RESOLVE' })} disabled={busyId === item.id}>
                                                            Resolve Escalation
                                                        </Button>
                                                    ) : (
                                                        <Button size="sm" variant="outline" onClick={() => setEscalationDialog({ item, action: 'ESCALATE' })} disabled={busyId === item.id}>
                                                            <Flag className="h-3.5 w-3.5" />
                                                            Escalate
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={10} className="px-3 py-8 text-center text-emerald-200">
                                            No credit requests found for this filter.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {dialog && (
                <DecisionDialog
                    state={dialog}
                    busy={busyId === dialog.item.id}
                    onClose={() => setDialog(null)}
                    onSubmit={submitDecision}
                />
            )}
            {escalationDialog && (
                <EscalationDialog
                    state={escalationDialog}
                    busy={busyId === escalationDialog.item.id}
                    onClose={() => setEscalationDialog(null)}
                    onSubmit={submitEscalation}
                />
            )}
            {handoffResult && (
                <WhatsAppHandoffDialog
                    handoff={handoffResult}
                    onClose={() => setHandoffResult(null)}
                />
            )}
        </div>
    )
}

function WhatsAppHandoffDialog({
    handoff,
    onClose,
}: {
    handoff: WhatsAppHandoff
    onClose: () => void
}) {
    const [copyStatus, setCopyStatus] = useState<string | null>(null)

    async function copyMessage() {
        try {
            await navigator.clipboard.writeText(handoff.messageText)
            setCopyStatus('Copied.')
        } catch {
            setCopyStatus('Select the text and copy it manually.')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir="rtl">
            <div className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 className="text-xl font-bold text-emerald-300">WhatsApp Confirmation</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    Balance was approved. Use these manual WhatsApp actions; no WhatsApp API message is sent by the panel.
                </p>
                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                    <div className="mb-2 text-xs text-muted-foreground">
                        Destination: {handoff.destinationLabel || 'Not configured'}
                    </div>
                    <textarea
                        readOnly
                        value={handoff.messageText}
                        rows={7}
                        className="w-full resize-none rounded-md border border-border bg-card p-3 text-sm text-foreground"
                    />
                </div>
                {copyStatus && <div className="mt-3 text-sm text-sky-200">{copyStatus}</div>}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button variant="outline" onClick={copyMessage}>
                        <Copy className="h-4 w-4" />
                        Copy
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!handoff.groupUrl}
                        onClick={() => handoff.groupUrl && window.open(handoff.groupUrl, '_blank', 'noopener,noreferrer')}
                    >
                        <MessageCircle className="h-4 w-4" />
                        Open Group
                    </Button>
                    <Button
                        disabled={!handoff.phoneUrl}
                        onClick={() => handoff.phoneUrl && window.open(handoff.phoneUrl, '_blank', 'noopener,noreferrer')}
                    >
                        <ExternalLink className="h-4 w-4" />
                        Send/Open User
                    </Button>
                </div>
            </div>
        </div>
    )
}

function DecisionDialog({
    state,
    busy,
    onClose,
    onSubmit,
}: {
    state: NonNullable<DialogState>
    busy: boolean
    onClose: () => void
    onSubmit: (note: string) => void
}) {
    const [note, setNote] = useState('')
    const copy = decisionCopy[state.decision]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir="rtl">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 className={`text-xl font-bold ${copy.tone}`}>{copy.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                    {state.item.requestNumber} - {state.item.username} - {formatUsd(state.item.amountUsd)}
                </div>
                <label className="mt-4 block text-sm font-medium text-foreground">
                    Admin note
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={4}
                        maxLength={500}
                        className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-[#9ffb06]/60"
                        placeholder="Write a clear decision note."
                    />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
                    <Button onClick={() => onSubmit(note)} loading={busy}>
                        {copy.confirm}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function EscalationDialog({
    state,
    busy,
    onClose,
    onSubmit,
}: {
    state: NonNullable<EscalationDialogState>
    busy: boolean
    onClose: () => void
    onSubmit: (note: string) => void
}) {
    const [note, setNote] = useState('')
    const copy = escalationCopy[state.action]
    const noteRequired = state.action === 'ESCALATE'
    const canSubmit = !noteRequired || note.trim().length > 0

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir="rtl">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 className={`text-xl font-bold ${copy.tone}`}>{copy.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                    {state.item.requestNumber} - {state.item.username} - {formatUsd(state.item.amountUsd)}
                </div>
                <label className="mt-4 block text-sm font-medium text-foreground">
                    Escalation note{noteRequired ? ' *' : ''}
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={4}
                        maxLength={500}
                        className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-[#9ffb06]/60"
                        placeholder={noteRequired ? 'Explain why this request needs attention.' : 'Optional resolution note.'}
                    />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
                    <Button onClick={() => onSubmit(note)} loading={busy} disabled={!canSubmit}>
                        {copy.confirm}
                    </Button>
                </div>
            </div>
        </div>
    )
}
