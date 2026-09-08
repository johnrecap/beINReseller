'use client'

import { PanelDialog } from '@/components/ui/dialog'
import { FormEvent, useCallback, useEffect, useState, useRef } from 'react'
import { usePanelRequest, usePanelCommand } from '@/hooks/usePanelRequest'
import { useTranslation } from '@/hooks/useTranslation'
import { PanelLoadError, PanelCommandWarning } from '@/components/ui/PanelLoadError'
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

export default function CreditControlDialog({
    isOpen,
    onClose,
    onSuccess,
    userId,
    username,
}: CreditControlDialogProps) {
    const { t, language } = useTranslation()
    const { request: command, isUnconfirmed, reconcile } = usePanelCommand()
    const limitKey = `limit:${userId}`
    const paymentKey = `payment:${userId}`
    const copy = t.panelUi.creditControl
    const formatUsd = (value: number) => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : language === 'bn' ? 'bn-BD' : 'en-US', {style: 'currency', currency: 'USD'}).format(value)
    const formatDate = (value: string) => new Intl.DateTimeFormat(language, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value))
    const { load, loading, error: readError, cancel } = usePanelRequest()
    const submitting = useRef(false)
    const [savingLimit, setSavingLimit] = useState(false)
    const [recordingPayment, setRecordingPayment] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [payload, setPayload] = useState<CreditDebtPayload | null>(null)
    const [limitUsd, setLimitUsd] = useState('')

    const loadData = useCallback(async () => {
        if (!userId) return false
        setPayload(null)
        setError(null)
        return load<CreditDebtPayload>(`/api/credit-debts/${userId}`, data => {
            setPayload(data)
            setLimitUsd(String(data.summary.creditDebtLimitUsd))
        })
    }, [userId, load])

    useEffect(() => {
        if (!isOpen) return
        const timer = setTimeout(() => void loadData(), 0)
        return () => { clearTimeout(timer); cancel() }
    }, [isOpen, loadData, cancel])

    async function updateLimit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (isUnconfirmed(limitKey) || !userId || payload?.user.id !== userId || submitting.current || loading || readError !== null) return
        submitting.current = true
        setSavingLimit(true)
        setError(null)
        try {
            const response = await command(`/api/credit-debts/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creditDebtLimitUsd: limitUsd }),
            }, limitKey)
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || copy.limitFailed)
            await loadData()
            onSuccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : copy.limitFailed)
        } finally {
            submitting.current = false
            setSavingLimit(false)
        }
    }

    async function recordPayment(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (isUnconfirmed(paymentKey) || !userId || payload?.user.id !== userId || submitting.current || loading || readError !== null || !payload || payload.summary.outstandingDebtUsd <= 0) return
        submitting.current = true
        const form = event.currentTarget
        const formData = new FormData(form)
        setRecordingPayment(true)
        setError(null)
        try {
            const response = await command(`/api/credit-debts/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amountUsd: formData.get('amountUsd'),
                    note: formData.get('note'),
                }),
            }, paymentKey)
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || copy.paymentFailed)
            form.reset()
            await loadData()
            onSuccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : copy.paymentFailed)
        } finally {
            submitting.current = false
            setRecordingPayment(false)
        }
    }

    if (!isOpen || !userId) return null

    const summary = payload?.user.id === userId ? payload.summary : undefined

    return (
        <PanelDialog onClose={() => { if (!submitting.current) onClose() }} busy={savingLimit || recordingPayment} title={<>
                        <CreditCard className="h-5 w-5 text-cyan-500" />
                        {copy.title}
                    </>} className="max-w-2xl">
            <div className="w-full max-w-2xl rounded-xl bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border bg-secondary/50 p-4">
                    <h3 className="flex items-center gap-2 font-bold text-foreground">
                        <CreditCard className="h-5 w-5 text-cyan-500" />
                        {copy.title}
                    </h3>
                    <button
                        type="button"
                        onClick={() => { if (!submitting.current) onClose() }}
                        disabled={savingLimit || recordingPayment}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                        title={t.panelUi.close}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="border-b border-border bg-secondary/30 p-4 text-sm">
                    {t.panelTable.panelUser}: <span className="font-bold">{payload?.user.id === userId ? payload.user.username : username}</span>
                </div>

                <div className="space-y-4 p-4">
                    <PanelCommandWarning show={isUnconfirmed(limitKey)} reviewing={loading || savingLimit || recordingPayment} onReview={() => { void reconcile([limitKey], loadData) }} />
                    <PanelCommandWarning show={isUnconfirmed(paymentKey)} />
                    {readError !== null && <PanelLoadError status={readError} retry={() => void loadData()} />}
                    {error && (
                        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    {loading && !summary ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-border p-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t.common.loading}
                        </div>
                    ) : summary && payload ? (
                        <>
                            <div className="grid gap-3 sm:grid-cols-4">
                                <DebtMetric label={copy.limit} value={formatUsd(summary.creditDebtLimitUsd)} />
                                <DebtMetric label={copy.debt} value={formatUsd(summary.outstandingDebtUsd)} />
                                <DebtMetric label={copy.pending} value={formatUsd(summary.pendingRequestedUsd)} />
                                <DebtMetric label={copy.remaining} value={formatUsd(summary.availableUsd)} />
                            </div>

                            <form onSubmit={updateLimit} className="rounded-lg border border-border p-4">
                                <label className="block text-sm font-medium text-foreground">
                                    {copy.requestLimit}
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
                                        disabled={isUnconfirmed(limitKey) || savingLimit || recordingPayment}
                                        className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
                                    >
                                        {savingLimit && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {copy.saveLimit}
                                    </button>
                                </div>
                            </form>

                            <form onSubmit={recordPayment} className="rounded-lg border border-border p-4">
                                <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
                                    <label className="block text-sm font-medium text-foreground">
                                        {copy.paymentAmount}
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
                                        {t.panelTable.note}
                                        <input
                                            name="note"
                                            maxLength={500}
                                            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-green-500"
                                            placeholder={t.common.optionalNote}
                                        />
                                    </label>
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={isUnconfirmed(paymentKey) || savingLimit || recordingPayment || summary.outstandingDebtUsd <= 0}
                                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                                    >
                                        {recordingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {copy.recordPayment}
                                    </button>
                                </div>
                            </form>

                            <div className="rounded-lg border border-border">
                                <div className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold text-foreground">
                                    <ReceiptText className="h-4 w-4" />
                                    {copy.recentEntries}
                                </div>
                                {!payload.entries.length ? (
                                    <div className="p-4 text-sm text-muted-foreground">{copy.noEntries}</div>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {payload.entries.map((entry) => (
                                            <div key={entry.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto]">
                                                <div>
                                                    <div className="font-medium text-foreground">
                                                        {entry.entryType === 'CREDIT_APPROVED' ? copy.approved : copy.recorded}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {formatDate(entry.createdAt)}
                                                        {entry.recordedBy ? ` · ${t.panelTable.recordedBy}: ${entry.recordedBy.username}` : ''}
                                                    </div>
                                                    {entry.note && <div className="mt-1 text-xs text-muted-foreground">{entry.note}</div>}
                                                </div>
                                                <div className="text-end">
                                                    <div className="font-semibold text-foreground">{formatUsd(entry.amountUsd)}</div>
                                                    <div className="text-xs text-muted-foreground">{t.panelTable.debtAfter}: {formatUsd(entry.debtAfterUsd)}</div>
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
        </PanelDialog>
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
