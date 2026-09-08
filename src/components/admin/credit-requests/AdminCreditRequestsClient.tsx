'use client'

import { usePanelRequest, usePanelCommand } from '@/hooks/usePanelRequest'
import { PanelLoadError, PanelCommandWarning } from '@/components/ui/PanelLoadError'
import { PanelTablePagination } from '@/components/ui/PanelTableControls'
import { PanelDialog } from '@/components/ui/dialog'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useTranslation } from '@/hooks/useTranslation'
import {
    applyCreditRequestSourceGroupFilter,
    decodeCreditRequestSourceGroupOption,
    encodeCreditRequestSourceGroupOption,
    type CreditRequestSourceGroupSelection,
} from '@/lib/credit-requests/source-group-filter'

type CreditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
type Decision = 'APPROVE' | 'REJECT' | 'CANCEL'
type EscalationAction = 'ESCALATE' | 'RESOLVE'

type CreditDebtSummary = {
    creditDebtLimitUsd: number
    pendingRequestedUsd: number
    outstandingDebtUsd: number
    usedCapacityUsd: number
    availableUsd: number
    hasLimit: boolean
}

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
    ownerType: string | null
    ownerId: string | null
    ownerLabel: string | null
    agentId: string | null
    agentName: string | null
    sourceGroup: string | null
    debtSummary: CreditDebtSummary | null
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
        hasNoSourceGroup: boolean
        noSourceGroupCount: number
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
    autoCopyStatus?: string | null
}

const getStatusOptions = (t: ReturnType<typeof useTranslation>['t']): Array<{ value: CreditRequestStatus | 'ALL'; label: string }> => [
    { value: 'PENDING', label: t.status.pending },
    { value: 'APPROVED', label: t.panelUi.operationalCopy.approved },
    { value: 'REJECTED', label: t.panelUi.operationalCopy.rejected },
    { value: 'CANCELLED', label: t.status.cancelled },
    { value: 'ALL', label: t.common.all },
]

const getEscalationOptions = (t: ReturnType<typeof useTranslation>['t']): Array<{ value: 'ALL' | 'ESCALATED' | 'NORMAL'; label: string }> => [
    { value: 'ALL', label: t.panelUi.operationalCopy.allEscalationStates },
    { value: 'ESCALATED', label: t.panelUi.operationalCopy.escalatedOnly },
    { value: 'NORMAL', label: t.panelUi.operationalCopy.notEscalated },
]

const getDecisionCopy = (t: ReturnType<typeof useTranslation>['t']): Record<Decision, { title: string; body: string; confirm: string; tone: string }> => ({
    APPROVE: {
        title: t.panelUi.operationalCopy.approveCreditTitle,
        body: t.panelUi.operationalCopy.approveCreditHint,
        confirm: t.panelUi.operationalCopy.approveAndAdd,
        tone: 'text-emerald-300',
    },
    REJECT: {
        title: t.panelUi.operationalCopy.rejectCreditTitle,
        body: t.panelUi.operationalCopy.rejectCreditHint,
        confirm: t.panelUi.operationalCopy.rejectRequest,
        tone: 'text-red-300',
    },
    CANCEL: {
        title: t.panelUi.operationalCopy.cancelCreditTitle,
        body: t.panelUi.operationalCopy.cancelCreditHint,
        confirm: t.panelUi.operationalCopy.cancelRequest,
        tone: 'text-amber-300',
    },
})

const getEscalationCopy = (t: ReturnType<typeof useTranslation>['t']): Record<EscalationAction, { title: string; body: string; confirm: string; tone: string }> => ({
    ESCALATE: {
        title: t.panelUi.operationalCopy.escalateCreditTitle,
        body: t.panelUi.operationalCopy.escalateCreditHint,
        confirm: t.panelUi.operationalCopy.escalateRequest,
        tone: 'text-amber-300',
    },
    RESOLVE: {
        title: t.panelUi.operationalCopy.resolveEscalation,
        body: t.panelUi.operationalCopy.resolveEscalationHint,
        confirm: t.panelUi.operationalCopy.resolveEscalation,
        tone: 'text-emerald-300',
    },
})

function formatDate(value: string | null, language: string) {
    if (!value) return '-'
    return new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function formatUsd(value: number) {
    return `USD ${value.toFixed(2)}`
}

function DebtSummaryCell({ summary }: { summary: CreditDebtSummary | null }) {
    const { t } = useTranslation()
    if (!summary) return <span className="text-xs text-muted-foreground">-</span>

    return (
        <div className="space-y-1 text-xs">
            <div className="font-semibold text-foreground">
                {t.panelUi.creditControl.debt} {formatUsd(summary.outstandingDebtUsd)} / {formatUsd(summary.creditDebtLimitUsd)}
            </div>
            <div className="text-muted-foreground">{t.status.pending} {formatUsd(summary.pendingRequestedUsd)}</div>
            <div className={summary.availableUsd > 0 ? 'text-emerald-300' : 'text-amber-300'}>
                {t.panelUi.creditControl.remaining} {formatUsd(summary.availableUsd)}
            </div>
        </div>
    )
}

function StatusBadge({ status }: { status: CreditRequestStatus }) {
    const { t } = useTranslation()
    const className = {
        PENDING: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
        APPROVED: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
        REJECTED: 'border-red-400/40 bg-red-400/10 text-red-300',
        CANCELLED: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
    }[status]

    return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{({PENDING:t.status.pending,APPROVED:t.panelUi.operationalCopy.approved,REJECTED:t.panelUi.operationalCopy.rejected,CANCELLED:t.status.cancelled} as Record<string, string>)[status] || status}</span>
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
    const { t: tableText } = useTranslation()
    const { t, language } = useTranslation()
    const statusOptions = getStatusOptions(t)
    const escalationOptions = getEscalationOptions(t)
    const [status, setStatus] = useState<CreditRequestStatus | 'ALL'>('PENDING')
    const [agentId, setAgentId] = useState('')
    const [sourceGroupFilter, setSourceGroupFilter] = useState<CreditRequestSourceGroupSelection>({ mode: 'ALL' })
    const [escalationFilter, setEscalationFilter] = useState<'ALL' | 'ESCALATED' | 'NORMAL'>('ALL')
    const [search, setSearch] = useState('')
    const [data, setData] = useState<ApiResponse | null>(null)
    const { load, loading, error: readError, cancel } = usePanelRequest()
    const { request: command, hasUnconfirmed: unconfirmed, isUnconfirmed } = usePanelCommand()
    const mutationPending = useRef(false)
    const [page, setPage] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const [dialog, setDialog] = useState<DialogState>(null)
    const [escalationDialog, setEscalationDialog] = useState<EscalationDialogState>(null)
    const [handoffResult, setHandoffResult] = useState<WhatsAppHandoff | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    const queryString = useMemo(() => {
        const params = new URLSearchParams({ page: String(page), limit: '25' })
        if (status !== 'ALL') params.set('status', status)
        if (agentId) params.set('agentId', agentId)
        applyCreditRequestSourceGroupFilter(params, sourceGroupFilter)
        if (escalationFilter === 'ESCALATED') params.set('escalated', 'true')
        if (escalationFilter === 'NORMAL') params.set('escalated', 'false')
        if (search.trim()) params.set('search', search.trim())
        return params.toString()
    }, [agentId, escalationFilter, search, sourceGroupFilter, status, page])

    const loadData = useCallback(async () => {
        setData(null)
        await load<ApiResponse>(`/api/admin/credit-requests?${queryString}`, payload => {
            const lastPage = Math.max(1, payload.pagination.totalPages)
            if (page > lastPage) { setPage(lastPage); return }
            setData(payload)
        })
    }, [load, page, queryString])

    useEffect(() => {
        const timer = setTimeout(() => void loadData(), 0)
        return () => { clearTimeout(timer); cancel() }
    }, [loadData, cancel])

    async function submitDecision(note: string) {
        const commandKey = `decision:${dialog?.item.id}`
        if (isUnconfirmed(commandKey) || !dialog || mutationPending.current) return
        mutationPending.current = true
        const currentDialog = dialog
        const handoffWindow = currentDialog.decision === 'APPROVE'
            ? window.open('about:blank', '_blank')
            : null

        setBusyId(currentDialog.item.id)
        setError(null)
        try {
            const response = await command(`/api/admin/credit-requests/${currentDialog.item.id}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision: currentDialog.decision, note }),
            }, commandKey)
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || t.panelUi.operationalCopy.saveDecisionFailed)
            if (payload.whatsappHandoff) {
                const autoCopyStatus = await copyHandoffMessage(payload.whatsappHandoff.messageText, t)
                if (payload.whatsappHandoff.groupUrl) {
                    if (handoffWindow) {
                        handoffWindow.location.href = payload.whatsappHandoff.groupUrl
                    } else {
                        window.open(payload.whatsappHandoff.groupUrl, '_blank', 'noopener,noreferrer')
                    }
                } else {
                    handoffWindow?.close()
                }
                setHandoffResult({ ...payload.whatsappHandoff, autoCopyStatus })
            } else {
                handoffWindow?.close()
            }
            setDialog(null)
            await loadData()
        } catch (err) {
            handoffWindow?.close()
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.saveDecisionFailed)
        } finally {
            mutationPending.current = false
            setBusyId(null)
        }
    }

    async function submitEscalation(note: string) {
        const commandKey = `escalation:${escalationDialog?.item.id}`
        if (isUnconfirmed(commandKey) || !escalationDialog || mutationPending.current) return
        mutationPending.current = true
        setBusyId(escalationDialog.item.id)
        setError(null)
        try {
            const response = await command(`/api/admin/credit-requests/${escalationDialog.item.id}/escalate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: escalationDialog.action, note }),
            }, commandKey)
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || t.panelUi.operationalCopy.saveEscalationFailed)
            setEscalationDialog(null)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.saveEscalationFailed)
        } finally {
            mutationPending.current = false
            setBusyId(null)
        }
    }

    async function retryNotification(item: AdminCreditRequestItem) {
        const commandKey = `notification:${item.id}`
        if (isUnconfirmed(commandKey) || mutationPending.current) return
        mutationPending.current = true
        setBusyId(item.id)
        setError(null)
        try {
            const response = await command(`/api/admin/credit-requests/${item.id}/notification-retry`, {
                method: 'POST',
            }, commandKey)
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || t.panelUi.operationalCopy.retryNotificationFailed)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.retryNotificationFailed)
        } finally {
            mutationPending.current = false
            setBusyId(null)
        }
    }

    function handleSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        void loadData()
    }

    return (
        <div className="min-h-screen bg-background p-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
                            <AlertCircle className="h-4 w-4" />
                            {t.panelUi.operationalCopy.creditApprovalHint}
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">{t.panelUi.operationalCopy.creditRequests}</h1>
                            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                                {t.panelUi.operationalCopy.creditRequestsHint}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={() => void loadData()} loading={loading}>
                        <RefreshCw className="h-4 w-4" />
                        {t.common.refresh}
                    </Button>
                </header>

                {data && <section className="grid gap-3 md:grid-cols-4">
                    <SummaryCard label={t.status.pending} value={data?.summary.PENDING || 0} icon={Clock3} tone="text-amber-300" />
                    <SummaryCard label={t.panelUi.operationalCopy.approved} value={data?.summary.APPROVED || 0} icon={CheckCircle2} tone="text-emerald-300" />
                    <SummaryCard label={t.panelUi.operationalCopy.rejected} value={data?.summary.REJECTED || 0} icon={XCircle} tone="text-red-300" />
                    <SummaryCard label={t.status.cancelled} value={data?.summary.CANCELLED || 0} icon={AlertCircle} tone="text-slate-300" />
                </section>}

                <form onSubmit={handleSearch} className="rounded-lg border border-border bg-card p-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(event) => { setPage(1); setSearch(event.target.value) }}
                                placeholder={t.panelUi.operationalCopy.creditSearch}
                                className="ps-10"
                            />
                        </div>
                        <select
                            value={({PENDING:t.status.pending,APPROVED:t.panelUi.operationalCopy.approved,REJECTED:t.panelUi.operationalCopy.rejected,CANCELLED:t.status.cancelled} as Record<string, string>)[status] || status}
                            onChange={(event) => { setPage(1); setStatus(event.target.value as CreditRequestStatus | 'ALL') }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select
                            value={agentId}
                            onChange={(event) => { setPage(1); setAgentId(event.target.value) }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            <option value="">{t.panelUi.operationalCopy.allAgents}</option>
                            {(data?.filters.agents || []).map((agent) => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                        </select>
                        <select
                            value={encodeCreditRequestSourceGroupOption(sourceGroupFilter)}
                            onChange={(event) => { setPage(1); setSourceGroupFilter(decodeCreditRequestSourceGroupOption(event.target.value)) }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            <option value={encodeCreditRequestSourceGroupOption({ mode: 'ALL' })}>{t.common.allGroups}</option>
                            {data?.filters.hasNoSourceGroup ? (
                                <option value={encodeCreditRequestSourceGroupOption({ mode: 'NONE' })}>
                                    {t.common.withoutGroup} ({data.filters.noSourceGroupCount})
                                </option>
                            ) : null}
                            {(data?.filters.sourceGroups || []).map((group) => (
                                <option
                                    key={group}
                                    value={encodeCreditRequestSourceGroupOption({ mode: 'VALUE', value: group })}
                                >
                                    {group}
                                </option>
                            ))}
                        </select>
                        <select
                            value={escalationFilter}
                            onChange={(event) => { setPage(1); setEscalationFilter(event.target.value as 'ALL' | 'ESCALATED' | 'NORMAL') }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                            {escalationOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <Button type="submit" loading={loading}>{t.common.search}</Button>
                    </div>
                </form>

                {readError !== null && <PanelLoadError status={readError} retry={() => void loadData()} />}
                {loading && <p role="status">{t.common.loading}</p>}
                <PanelCommandWarning show={unconfirmed} />                {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                        {error}
                    </div>
                )}

                {data && <section className="min-w-0 rounded-lg border border-border bg-card">
                    <div className="overflow-x-auto">
                        <Table panel density="compact" className="w-full text-sm">
                            <TableHeader className="border-b border-border bg-secondary/60 text-muted-foreground">
                                <TableRow>
                                    <TableHead className="px-3 py-3 text-start">{tableText.panelTable.orderId}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.activity.table.user}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.panelTable.debtLimit}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.forms.amount}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.panelTable.payment}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.panelTable.owner}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.panelTable.notification}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.panelTable.pointsPreview}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.common.status}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.manager.users.table.created}</TableHead>
                                    <TableHead className="px-3 py-3 text-start">{tableText.common.actions}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={11} className="px-3 py-8 text-center text-muted-foreground">{t.common.loading}</TableCell>
                                    </TableRow>
                                ) : data?.items.length ? (
                                    data.items.map((item) => (
                                        <TableRow key={item.id} className="border-b border-border/60 align-top">
                                            <TableCell className="px-3 py-3">
                                                <div className="font-mono text-xs text-foreground">{item.requestNumber}</div>
                                                {item.notes && <div className="mt-1 max-w-[220px] text-xs text-muted-foreground">{item.notes}</div>}
                                                {item.escalated && (
                                                    <div className="mt-2 flex max-w-[240px] items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
                                                        <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                        <span>{item.escalationNote || t.panelUi.operationalCopy.escalatedAttention}</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-3 py-3">
                                                <div className="font-semibold text-foreground">{item.username}</div>
                                                <div className="text-xs text-muted-foreground">{t.panelUi.operationalCopy.balanceLabel} {formatUsd(item.user.balance)}</div>
                                            </TableCell>
                                            <TableCell className="px-3 py-3"><DebtSummaryCell summary={item.debtSummary} /></TableCell>
                                            <TableCell className="px-3 py-3 font-semibold text-foreground">{formatUsd(item.amountUsd)}</TableCell>
                                            <TableCell className="px-3 py-3 text-foreground">{item.paymentMethod}</TableCell>
                                            <TableCell className="px-3 py-3">
                                                <div className="text-foreground">{item.ownerLabel || item.agentName || '-'}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {item.ownerType === 'AGENT' ? item.sourceGroup || t.common.withoutGroup : item.ownerType || '-'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-3 py-3">
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
                                                        {t.common.retry}
                                                    </Button>
                                                )}
                                                {item.whatsappHandoff && (
                                                    <button
                                                        type="button"
                                                        className="mt-2 text-xs text-sky-300 underline"
                                                        onClick={() => setHandoffResult(item.whatsappHandoff)}
                                                    >
                                                        {t.panelUi.operationalCopy.whatsappHandoff}
                                                    </button>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-3 py-3 text-xs text-muted-foreground">
                                                <div>{t.panelUi.operationalCopy.userLabel} {item.pointsPreview.user.points}</div>
                                                <div>{t.panelUi.operationalCopy.agentLabel} {item.pointsPreview.agent.points}</div>
                                            </TableCell>
                                            <TableCell className="px-3 py-3"><StatusBadge status={item.status} /></TableCell>
                                            <TableCell className="px-3 py-3 text-muted-foreground">{formatDate(item.createdAt, language)}</TableCell>
                                            <TableCell className="px-3 py-3">
                                                <div className="flex min-w-[260px] flex-wrap gap-2">
                                                    {item.status === 'PENDING' ? (
                                                        <>
                                                            <Button size="sm" onClick={() => setDialog({ item, decision: 'APPROVE' })} disabled={busyId !== null}>
                                                                {t.panelUi.operationalCopy.approve}
                                                            </Button>
                                                            <Button size="sm" variant="danger" onClick={() => setDialog({ item, decision: 'REJECT' })} disabled={busyId !== null}>
                                                                {t.panelUi.operationalCopy.reject}
                                                            </Button>
                                                            <Button size="sm" variant="outline" onClick={() => setDialog({ item, decision: 'CANCEL' })} disabled={busyId !== null}>
                                                                {t.common.cancel}
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <div className="basis-full text-xs text-muted-foreground">
                                                            {item.decisionNote || t.panelUi.operationalCopy.decisionSaved}
                                                        </div>
                                                    )}
                                                    {item.escalated ? (
                                                        <Button size="sm" variant="outline" onClick={() => setEscalationDialog({ item, action: 'RESOLVE' })} disabled={busyId !== null}>
                                                            {t.panelUi.operationalCopy.resolveEscalation}
                                                        </Button>
                                                    ) : (
                                                        <Button size="sm" variant="outline" onClick={() => setEscalationDialog({ item, action: 'ESCALATE' })} disabled={busyId !== null}>
                                                            <Flag className="h-3.5 w-3.5" />
                                                            {t.panelUi.operationalCopy.escalate}
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={11} className="px-3 py-8 text-center text-emerald-200">
                                            {t.panelUi.operationalCopy.noFilteredCredit}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <PanelTablePagination page={page} pageSize={25} total={data.pagination.total} onPageChange={setPage} />
                </section>}
            </div>

            {dialog && (
                <DecisionDialog
                    state={dialog}
                    busy={busyId === dialog.item.id}
                    error={error}
                    unconfirmed={isUnconfirmed(`decision:${dialog.item.id}`)}
                    onClose={() => { if (!mutationPending.current) { setDialog(null); setError(null) } }}
                    onSubmit={submitDecision}
                />
            )}
            {escalationDialog && (
                <EscalationDialog
                    state={escalationDialog}
                    busy={busyId === escalationDialog.item.id}
                    error={error}
                    unconfirmed={isUnconfirmed(`escalation:${escalationDialog.item.id}`)}
                    onClose={() => { if (!mutationPending.current) { setEscalationDialog(null); setError(null) } }}
                    onSubmit={submitEscalation}
                />
            )}
            {handoffResult && (
                <WhatsAppHandoffDialog
                    key={handoffResult.id}
                    handoff={handoffResult}
                    onClose={() => setHandoffResult(null)}
                />
            )}
        </div>
    )
}

async function copyHandoffMessage(messageText: string, t: ReturnType<typeof useTranslation>['t']) {
    if (!navigator.clipboard?.writeText) {
        return t.panelUi.operationalCopy.clipboardUnavailable
    }

    try {
        await navigator.clipboard.writeText(messageText)
        return t.panelUi.operationalCopy.autoCopied
    } catch {
        return t.panelUi.operationalCopy.autoCopyFailed
    }
}

function WhatsAppHandoffDialog({
    handoff,
    onClose,
}: {
    handoff: WhatsAppHandoff
    onClose: () => void
}) {
    const { t } = useTranslation()
    const [copyStatus, setCopyStatus] = useState<string | null>(handoff.autoCopyStatus || null)

    async function copyMessage() {
        try {
            await navigator.clipboard.writeText(handoff.messageText)
            setCopyStatus(t.panelUi.operationalCopy.copied)
        } catch {
            setCopyStatus(t.panelUi.operationalCopy.copyManually)
        }
    }

    return (
        <PanelDialog onClose={onClose} busy={false} title={<>{t.panelUi.operationalCopy.whatsappConfirmation}</>} className="max-w-xl">
            <div className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 className="text-xl font-bold text-emerald-300">{t.panelUi.operationalCopy.whatsappConfirmation}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    {t.panelUi.operationalCopy.whatsappConfirmationHint}
                </p>
                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                    <div className="mb-2 text-xs text-muted-foreground">
                        {t.panelUi.operationalCopy.destinationLabel} {handoff.destinationLabel || t.panelUi.operationalCopy.notConfigured}
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
                    <Button variant="outline" onClick={onClose}>{t.common.close}</Button>
                    <Button variant="outline" onClick={copyMessage}>
                        <Copy className="h-4 w-4" />
                        {t.common.copy}
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!handoff.groupUrl}
                        onClick={() => handoff.groupUrl && window.open(handoff.groupUrl, '_blank', 'noopener,noreferrer')}
                    >
                        <MessageCircle className="h-4 w-4" />
                        {t.panelUi.operationalCopy.openGroup}
                    </Button>
                    <Button
                        disabled={!handoff.phoneUrl}
                        onClick={() => handoff.phoneUrl && window.open(handoff.phoneUrl, '_blank', 'noopener,noreferrer')}
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t.panelUi.operationalCopy.openUser}
                    </Button>
                </div>
            </div>
        </PanelDialog>
    )
}

function DecisionDialog({
    state,
    busy,
    error,
    unconfirmed,
    onClose,
    onSubmit,
}: {
    state: NonNullable<DialogState>
    busy: boolean
    error?: string | null
    unconfirmed: boolean
    onClose: () => void
    onSubmit: (note: string) => void
}) {
    const { t } = useTranslation()
    const [note, setNote] = useState('')
    const copy = getDecisionCopy(t)[state.decision]

    return (
        <PanelDialog onClose={onClose} busy={busy} title={<>{copy.title}</>} className="max-w-lg">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 className={`text-xl font-bold ${copy.tone}`}>{copy.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
                <PanelCommandWarning show={unconfirmed} />
                {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                    {state.item.requestNumber} - {state.item.username} - {formatUsd(state.item.amountUsd)}
                </div>
                {state.decision === 'APPROVE' && state.item.debtSummary && (
                    <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                        <div>{t.panelUi.operationalCopy.currentDebtLabel} {formatUsd(state.item.debtSummary.outstandingDebtUsd)}</div>
                        <div>{t.panelUi.operationalCopy.projectedDebtLabel} {formatUsd(state.item.debtSummary.outstandingDebtUsd + state.item.amountUsd)}</div>
                        <div>{t.panelUi.operationalCopy.remainingCapacityLabel} {formatUsd(state.item.debtSummary.availableUsd)}</div>
                    </div>
                )}
                <label className="mt-4 block text-sm font-medium text-foreground">
                    {t.panelUi.operationalCopy.adminNote}
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={4}
                        maxLength={500}
                        className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-[#9ffb06]/60"
                        placeholder={t.panelUi.operationalCopy.decisionNoteHint}
                    />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>{t.common.back}</Button>
                    <Button onClick={() => onSubmit(note)} loading={busy} disabled={unconfirmed}>
                        {copy.confirm}
                    </Button>
                </div>
            </div>
        </PanelDialog>
    )
}

function EscalationDialog({
    state,
    busy,
    error,
    unconfirmed,
    onClose,
    onSubmit,
}: {
    state: NonNullable<EscalationDialogState>
    busy: boolean
    error?: string | null
    unconfirmed: boolean
    onClose: () => void
    onSubmit: (note: string) => void
}) {
    const { t } = useTranslation()
    const [note, setNote] = useState('')
    const copy = getEscalationCopy(t)[state.action]
    const noteRequired = state.action === 'ESCALATE'
    const canSubmit = !noteRequired || note.trim().length > 0

    return (
        <PanelDialog onClose={onClose} busy={busy} title={<>{copy.title}</>} className="max-w-lg">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 className={`text-xl font-bold ${copy.tone}`}>{copy.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
                <PanelCommandWarning show={unconfirmed} />
                {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                    {state.item.requestNumber} - {state.item.username} - {formatUsd(state.item.amountUsd)}
                </div>
                <label className="mt-4 block text-sm font-medium text-foreground">
                    {t.panelUi.operationalCopy.escalationNote}{noteRequired ? ' *' : ''}
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={4}
                        maxLength={500}
                        className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-[#9ffb06]/60"
                        placeholder={noteRequired ? t.panelUi.operationalCopy.escalationReasonHint : t.panelUi.operationalCopy.resolutionNoteHint}
                    />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>{t.common.back}</Button>
                    <Button onClick={() => onSubmit(note)} loading={busy} disabled={unconfirmed || !canSubmit}>
                        {copy.confirm}
                    </Button>
                </div>
            </div>
        </PanelDialog>
    )
}
