'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { usePanelRequest, usePanelCommand } from '@/hooks/usePanelRequest'
import { PanelLoadError, PanelCommandWarning } from '@/components/ui/PanelLoadError'
import { AlertCircle, CheckCircle2, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/hooks/useTranslation'
import type { CreditRequestListItem } from '@/lib/credit-requests/types'

type Eligibility = {
    canRequest: boolean
    reason: string
    ownerType: string | null
    ownerLabel: string | null
    agentName: string | null
    sourceGroup: string | null
    debtSummary: CreditDebtSummary
}

type CreditDebtSummary = {
    creditDebtLimitUsd: number
    pendingRequestedUsd: number
    outstandingDebtUsd: number
    usedCapacityUsd: number
    availableUsd: number
    hasLimit: boolean
}

type CreditRequestsResponse = {
    eligibility: Eligibility
    requests: CreditRequestListItem[]
}

const getBlockedMessages = (t: ReturnType<typeof useTranslation>['t']): Record<string, string> => ({
    NOT_USER: t.panelUi.operationalCopy.onlyCustomers,
    INACTIVE_USER: t.panelUi.operationalCopy.inactiveCredit,
    MANAGER_OWNED: t.panelUi.operationalCopy.managerCreditBlocked,
    UNOWNED: t.panelUi.operationalCopy.unownedCredit,
    NO_ACTIVE_AGENT_ASSIGNMENT: t.panelUi.operationalCopy.noActiveAssignment,
    CREDIT_LIMIT_NOT_CONFIGURED: t.panelUi.operationalCopy.creditLimitMissing,
    CREDIT_LIMIT_EXCEEDED: t.panelUi.operationalCopy.creditCapacityUsed,
})

function ownerDescription(eligibility: Eligibility | undefined, t: ReturnType<typeof useTranslation>['t']) {
    if (!eligibility) return ''
    if (eligibility.ownerType === 'AGENT') {
        return t.panelUi.operationalCopy.ownerGroup.replace('{agent}', eligibility.agentName || eligibility.ownerLabel || '-').replace('{group}', eligibility.sourceGroup || t.common.withoutGroup)
    }

    return t.panelUi.operationalCopy.ownerDirect.replace('{owner}', eligibility.ownerLabel || t.panelUi.operationalCopy.adminDirect)
}

function formatDate(value: string, language: string) {
    return new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function formatUsd(value: number) {
    return `USD ${value.toFixed(2)}`
}

function DebtSummaryPanel({ summary }: { summary: CreditDebtSummary }) {
    const { t } = useTranslation()
    const items = [
        { label: t.panelUi.creditControl.limit, value: formatUsd(summary.creditDebtLimitUsd) },
        { label: t.panelUi.operationalCopy.currentDebt, value: formatUsd(summary.outstandingDebtUsd) },
        { label: t.panelUi.operationalCopy.pendingRequestsMetric, value: formatUsd(summary.pendingRequestedUsd) },
        { label: t.panelUi.operationalCopy.available, value: formatUsd(summary.availableUsd) },
    ]

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs uppercase text-[var(--color-text-secondary)]">{item.label}</div>
                    <div className="mt-1 font-semibold text-white">{item.value}</div>
                </div>
            ))}
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const { t } = useTranslation()
    const className = status === 'PENDING'
        ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
        : status === 'APPROVED'
            ? 'border-green-500/40 bg-green-500/10 text-green-300'
            : 'border-red-500/40 bg-red-500/10 text-red-300'

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
            {({PENDING:t.status.pending,APPROVED:t.panelUi.operationalCopy.approved,REJECTED:t.panelUi.operationalCopy.rejected,CANCELLED:t.status.cancelled} as Record<string, string>)[status] || status}
        </span>
    )
}

export default function RequestCreditForm() {
    const { t: tableText } = useTranslation()
    const { t, language } = useTranslation()
    const [data, setData] = useState<CreditRequestsResponse | null>(null)
    const { load, loading, error: loadError, cancel } = usePanelRequest()
    const { request: command, unconfirmed } = usePanelCommand()
    const mutationPending = useRef(false)
    const [submitting, setSubmitting] = useState(false)
    const [amountUsd, setAmountUsd] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('')
    const [notes, setNotes] = useState('')
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const loadData = useCallback(() => {
        setData(null)
        return load<CreditRequestsResponse>('/api/credit-requests', setData)
    }, [load])

    useEffect(() => {
        const timer = window.setTimeout(() => void loadData(), 0)
        return () => { window.clearTimeout(timer); cancel() }
    }, [loadData, cancel])

    const blockedMessage = useMemo(() => {
        if (!data || data.eligibility.canRequest) return null
        return getBlockedMessages(t)[data.eligibility.reason] || t.panelUi.operationalCopy.creditUnavailable
    }, [data, t])

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (unconfirmed || mutationPending.current || !data?.eligibility.canRequest) return
        mutationPending.current = true
        setSubmitting(true)
        setMessage(null)

        try {
            const response = await command('/api/credit-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amountUsd,
                    paymentMethod,
                    notes,
                }),
            })
            const payload = await response.json()

            if (!response.ok) {
                throw new Error(payload.error || t.panelUi.operationalCopy.submitCreditFailed)
            }

            setAmountUsd('')
            setPaymentMethod('')
            setNotes('')
            setMessage({
                type: 'success',
                text: t.panelUi.operationalCopy.submittedCredit,
            })
            await loadData()
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : t.panelUi.operationalCopy.submitCreditFailed,
            })
        } finally {
            mutationPending.current = false
            setSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t.panelUi.operationalCopy.requestCredit}</h1>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                        {t.panelUi.operationalCopy.requestCreditHint}
                    </p>
                </div>
                <Button variant="outline" onClick={() => void loadData()} loading={loading}>
                    <RefreshCw className="h-4 w-4" />
                    {t.common.refresh}
                </Button>
            </div>

            {loadError !== null && <PanelLoadError status={loadError} retry={() => void loadData()} />}
            <PanelCommandWarning show={unconfirmed} />
            {message && (
                <div role={message.type === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                    message.type === 'success'
                        ? 'border-green-500/40 bg-green-500/10 text-green-300'
                        : 'border-red-500/40 bg-red-500/10 text-red-300'
                }`}>
                    {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {message.text}
                </div>
            )}

            {data?.eligibility.debtSummary && (
                <DebtSummaryPanel summary={data.eligibility.debtSummary} />
            )}

            {loading && !data ? (
                <Card>
                    <CardContent className="pt-6 text-sm text-[var(--color-text-secondary)]">
                        {t.common.loading}
                    </CardContent>
                </Card>
            ) : !data ? null : blockedMessage ? (
                <Card>
                    <CardContent className="flex items-center gap-3 pt-6 text-sm text-yellow-300">
                        <AlertCircle className="h-5 w-5" />
                        {blockedMessage}
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>{t.panelUi.operationalCopy.newCreditRequest}</CardTitle>
                        <CardDescription>
                            {ownerDescription(data?.eligibility, t)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="amountUsd">{t.panelUi.operationalCopy.amountUsd}</Label>
                                <Input
                                    id="amountUsd"
                                    type="number"
                                    min="1"
                                    max={data?.eligibility.debtSummary.availableUsd || undefined}
                                    step="0.01"
                                    value={amountUsd}
                                    onChange={(event) => setAmountUsd(event.target.value)}
                                    disabled={!data?.eligibility.canRequest || data.eligibility.debtSummary.availableUsd <= 0}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="paymentMethod">{t.panelUi.operationalCopy.paymentMethod}</Label>
                                <Input
                                    id="paymentMethod"
                                    value={paymentMethod}
                                    onChange={(event) => setPaymentMethod(event.target.value)}
                                    maxLength={80}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">{t.transactions.notes}</Label>
                                <Input
                                    id="notes"
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                    maxLength={500}
                                />
                            </div>
                            <div className="md:col-span-3">
                                <Button
                                    type="submit"
                                    loading={submitting}
                                    disabled={unconfirmed || !data?.eligibility.canRequest || data.eligibility.debtSummary.availableUsd <= 0}
                                >
                                    <Send className="h-4 w-4" />
                                    {t.panelUi.operationalCopy.submitRequest}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {data && <Card>
                <CardHeader>
                    <CardTitle>{t.panelUi.operationalCopy.recentRequests}</CardTitle>
                </CardHeader>
                <CardContent>
                    {!data?.requests.length ? (
                        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-[var(--color-text-secondary)]">
                            {t.panelUi.operationalCopy.noCreditRequests}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table panel density="compact" className="w-full text-sm">
                                <TableHeader className="border-b border-white/10 text-[var(--color-text-secondary)]">
                                    <TableRow>
                                        <TableHead className="py-3 text-start">{tableText.panelTable.orderId}</TableHead>
                                        <TableHead className="py-3 text-start">{tableText.forms.amount}</TableHead>
                                        <TableHead className="py-3 text-start">{tableText.panelTable.payment}</TableHead>
                                        <TableHead className="py-3 text-start">{tableText.panelTable.owner}</TableHead>
                                        <TableHead className="py-3 text-start">{tableText.common.status}</TableHead>
                                        <TableHead className="py-3 text-start">{tableText.panelTable.notification}</TableHead>
                                        <TableHead className="py-3 text-start">{tableText.manager.users.table.created}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.requests.map((request) => (
                                        <TableRow key={request.id} className="border-b border-white/5">
                                            <TableCell className="py-3 font-mono text-xs">{request.requestNumber}</TableCell>
                                            <TableCell className="py-3 font-semibold">USD {request.amountUsd.toFixed(2)}</TableCell>
                                            <TableCell className="py-3">{request.paymentMethod}</TableCell>
                                            <TableCell className="py-3">
                                                <div>{request.ownerLabel || request.agentName || '-'}</div>
                                                {request.ownerType === 'AGENT' ? (
                                                    <div className="text-xs text-[var(--color-text-secondary)]">
                                                        {request.sourceGroup || t.common.withoutGroup}
                                                    </div>
                                                ) : null}
                                            </TableCell>
                                            <TableCell className="py-3"><StatusBadge status={request.status} /></TableCell>
                                            <TableCell className="py-3">{request.notificationStatus || '-'}</TableCell>
                                            <TableCell className="py-3 text-[var(--color-text-secondary)]">{formatDate(request.createdAt, language)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>}
        </div>
    )
}
