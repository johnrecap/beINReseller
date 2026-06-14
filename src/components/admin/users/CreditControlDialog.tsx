'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { CreditCard, Loader2, ReceiptText, X } from 'lucide-react'

type CreditDebtSummary = {
    creditDebtLimitUsd: number
    pendingRequestedUsd: number
    outstandingDebtUsd: number
    usedCapacityUsd: number
    availableUsd: number
    hasLimit: boolean
}

type CreditDebtEntry = {
    id: string
    entryType: 'CREDIT_APPROVED' | 'PAYMENT_RECORDED'
    amountUsd: number
    debtAfterUsd: number
    note: string | null
    createdAt: string
    recordedBy: { id: string; username: string } | null
}

type CreditDebtPayload = {
    user: {
        id: string
        username: string
        creditDebtLimitUsd: number
    }
    summary: CreditDebtSummary
    entries: CreditDebtEntry[]
}

type CreditControlDialogProps = {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    userId: string | null
    username: string | null
}

function formatUsd(value: number) {
    return `USD ${value.toFixed(2)}`
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

export default function CreditControlDialog({
    isOpen,
    onClose,
    onSuccess,
    userId,
    username,
}: CreditControlDialogProps) {
    const [loading, setLoading] = useState(false)
    const [savingLimit, setSavingLimit] = useState(false)
    const [recordingPayment, setRecordingPayment] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [payload, setPayload] = useState<CreditDebtPayload | null>(null)
    const [limitUsd, setLimitUsd] = useState('')

    const loadData = useCallback(async () => {
        if (!userId) return
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/credit-debts/${userId}`, { cache: 'no-store' })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || 'Failed to load credit control data')
            setPayload(data)
            setLimitUsd(String(data.summary.creditDebtLimitUsd))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load credit control data')
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        if (isOpen) void loadData()
    }, [isOpen, loadData])

    async function updateLimit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!userId) return
        setSavingLimit(true)
        setError(null)
        try {
            const response = await fetch(`/api/credit-debts/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creditDebtLimitUsd: limitUsd }),
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || 'Failed to update credit limit')
            await loadData()
            onSuccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update credit limit')
        } finally {
            setSavingLimit(false)
        }
    }

    async function recordPayment(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!userId) return
        const form = event.currentTarget
        const formData = new FormData(form)
        setRecordingPayment(true)
        setError(null)
        try {
            const response = await fetch(`/api/credit-debts/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amountUsd: formData.get('amountUsd'),
                    note: formData.get('note'),
                }),
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || 'Failed to record payment')
            form.reset()
            await loadData()
            onSuccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to record payment')
        } finally {
            setRecordingPayment(false)
        }
    }

    if (!isOpen || !userId) return null

    const summary = payload?.summary

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border bg-secondary/50 p-4">
                    <h3 className="flex items-center gap-2 font-bold text-foreground">
                        <CreditCard className="h-5 w-5 text-cyan-500" />
                        Credit Control
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                        title="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="border-b border-border bg-secondary/30 p-4 text-sm">
                    User: <span className="font-bold">{payload?.user.username || username}</span>
                </div>

                <div className="space-y-4 p-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    {loading && !summary ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-border p-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                        </div>
                    ) : summary ? (
                        <>
                            <div className="grid gap-3 sm:grid-cols-4">
                                <DebtMetric label="Limit" value={formatUsd(summary.creditDebtLimitUsd)} />
                                <DebtMetric label="Debt" value={formatUsd(summary.outstandingDebtUsd)} />
                                <DebtMetric label="Pending" value={formatUsd(summary.pendingRequestedUsd)} />
                                <DebtMetric label="Remaining" value={formatUsd(summary.availableUsd)} />
                            </div>

                            <form onSubmit={updateLimit} className="rounded-lg border border-border p-4">
                                <label className="block text-sm font-medium text-foreground">
                                    Request limit (USD)
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={limitUsd}
                                        onChange={(event) => setLimitUsd(event.target.value)}
                                        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-cyan-500"
                                        required
                                    />
                                </label>
                                <div className="mt-3 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={savingLimit}
                                        className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
                                    >
                                        {savingLimit && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Save limit
                                    </button>
                                </div>
                            </form>

                            <form onSubmit={recordPayment} className="rounded-lg border border-border p-4">
                                <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
                                    <label className="block text-sm font-medium text-foreground">
                                        Payment amount (USD)
                                        <input
                                            name="amountUsd"
                                            type="number"
                                            min="0.01"
                                            max={summary.outstandingDebtUsd || undefined}
                                            step="0.01"
                                            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-green-500"
                                            required
                                        />
                                    </label>
                                    <label className="block text-sm font-medium text-foreground">
                                        Note
                                        <input
                                            name="note"
                                            maxLength={500}
                                            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-green-500"
                                            placeholder="Optional"
                                        />
                                    </label>
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={recordingPayment || summary.outstandingDebtUsd <= 0}
                                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                                    >
                                        {recordingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Record payment
                                    </button>
                                </div>
                            </form>

                            <div className="rounded-lg border border-border">
                                <div className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold text-foreground">
                                    <ReceiptText className="h-4 w-4" />
                                    Recent debt entries
                                </div>
                                {!payload.entries.length ? (
                                    <div className="p-4 text-sm text-muted-foreground">No debt entries yet.</div>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {payload.entries.map((entry) => (
                                            <div key={entry.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto]">
                                                <div>
                                                    <div className="font-medium text-foreground">
                                                        {entry.entryType === 'CREDIT_APPROVED' ? 'Credit approved' : 'Payment recorded'}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {formatDate(entry.createdAt)}
                                                        {entry.recordedBy ? ` by ${entry.recordedBy.username}` : ''}
                                                    </div>
                                                    {entry.note && <div className="mt-1 text-xs text-muted-foreground">{entry.note}</div>}
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-semibold text-foreground">{formatUsd(entry.amountUsd)}</div>
                                                    <div className="text-xs text-muted-foreground">Debt after {formatUsd(entry.debtAfterUsd)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function DebtMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 font-semibold text-foreground">{value}</div>
        </div>
    )
}
