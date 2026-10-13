'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PanelDialog } from '@/components/ui/dialog'
import { CardReleaseDialog } from './CardReleaseDialog'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { withRequestDeadline } from '@/lib/request-deadline'
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Copy,
    Eye,
    EyeOff,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    Wallet,
} from 'lucide-react'
import type {
    FinancialReviewDecisionAction,
    FinancialReviewItem,
    FinancialReviewPaymentStatus,
    FinancialReviewState,
} from '@/lib/financial-review/types'
import { useTranslation } from '@/hooks/useTranslation'
import { validDecisionNote } from '../../../../shared/operations/review-decision-note'

type ApiResponse = {
    nextCursor?: string | null
    summary: {
        total: number
        needsDecision: number
        followUp: number
        refunded: number
        beinExecuted: number
        financiallyImpactedTotal: number
    }
    items: FinancialReviewItem[]
}

type DecisionDialogState = {
    item: FinancialReviewItem
    action: FinancialReviewDecisionAction
    decisionKey?: string
} | null

type ManualFulfillmentEvidencePayload = {
    sourceReference?: string
    invoiceNo: string
    beinAccountId: string
    cardNumberSnapshot: string
    packageNameSnapshot: string
    providerAmount: string
    currency: 'USD'
    evidenceSource: string
    evidenceNote: string
    observedAt: string
}

type ManualFulfillmentEvidenceDraft = Omit<ManualFulfillmentEvidencePayload, 'observedAt'> & {
    observedAt: string
}

const MANUAL_EVIDENCE_SOURCES = [
    'SBS_SOLD_REPORT_AND_ACTIVE_CONTRACT',
    'SBS_INVOICE_DETAILS_AND_ACTIVE_CONTRACT',
    'BEIN_SUPPORT_CONFIRMATION',
] as const

const getTabs = (t: ReturnType<typeof useTranslation>['t']): Array<{ id: FinancialReviewState | 'all'; label: string }> => [
    { id: 'needs_decision', label: t.panelUi.reviewCopy.needsDecision },
    { id: 'follow_up', label: t.panelUi.reviewCopy.followUp },
    { id: 'refunded', label: t.panelUi.reviewCopy.refunded },
    { id: 'bein_executed', label: t.panelUi.reviewCopy.executed },
    { id: 'archived', label: t.admin.financialReview.archivedTab },
    { id: 'all', label: t.panelUi.reviewCopy.all },
]

function formatAmount(value: number | null | undefined) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-'
    return value.toFixed(2)
}

function shortId(id: string) {
    return `${id.slice(0, 8)}...${id.slice(-4)}`
}

function formatUsd(value: number | null | undefined) {
    const amount = formatAmount(value)
    return amount === '-' ? '-' : `USD ${amount}`
}

function toDateTimeLocalValue(value: string | Date = new Date()) {
    const date = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return localDate.toISOString().slice(0, 16)
}

function createManualEvidenceDraft(item: FinancialReviewItem): ManualFulfillmentEvidenceDraft {
    const existing = item.manualFulfillmentEvidence
    return {
        invoiceNo: existing?.invoiceNo || '',
        beinAccountId: item.evidence.beinAccountId || item.beinAccount?.id || '',
        cardNumberSnapshot: item.cardNumber,
        packageNameSnapshot: existing?.packageNameSnapshot || item.packageName || item.evidence.selectedPackageName || '',
        providerAmount: existing?.providerAmount || '',
        currency: 'USD',
        evidenceSource: existing?.evidenceSource || '',
        evidenceNote: existing?.evidenceNote || '',
        observedAt: toDateTimeLocalValue(existing?.observedAt),
    }
}

function getBeinDebitSourceLabel(source: FinancialReviewItem['evidence']['beinDebitSource'], t: ReturnType<typeof useTranslation>['t']) {
    switch (source) {
        case 'ledger':
            return t.panelUi.reviewCopy.confirmedDebitLog
        case 'audit_snapshot':
            return t.panelUi.reviewCopy.snapshot
        case 'manual_verification':
            return t.panelUi.reviewCopy.manualAdmin
        case 'none':
            return t.panelUi.reviewCopy.noDebitEvidence
    }
}

export default function FinancialReviewClient() {
    const { t, dir } = useTranslation()
    const tabs = getTabs(t)
    const [state, setState] = useState<FinancialReviewState | 'all'>('needs_decision')
    const [search, setSearch] = useState('')
    const [cursor, setCursor] = useState('')
    const [previousCursors, setPreviousCursors] = useState<string[]>([])
    const [data, setData] = useState<ApiResponse | null>(null)
    const { load, loading, error: readError } = usePanelRequest()
    const mutationPending = useRef(false)
    const [error, setError] = useState<string | null>(null)
    const [dialog, setDialog] = useState<DecisionDialogState>(null)
    const [busyOperationId, setBusyOperationId] = useState<string | null>(null)
    const [releaseCard, setReleaseCard] = useState<string | null>(null)

    const fetchItems = useCallback(() => {
        const params = new URLSearchParams({ state, days: '90', ...(search.trim() ? { q: search.trim() } : {}), ...(cursor ? { cursor } : {}) })
        return load<ApiResponse>(`/api/admin/financial-review?${params}`, setData)
    }, [search, state, cursor, load])

    useEffect(() => {
        const query = new URLSearchParams(window.location.search).get('q')
        if (query) { setSearch(query); setState('all') }
    }, [])

    useEffect(() => { void fetchItems() }, [fetchItems])
    useEffect(() => {
        if (readError === 401 || readError === 403) { setDialog(null); setData(null) }
    }, [readError])

    const summaryCards = useMemo(() => [
        { label: t.panelUi.reviewCopy.needsDecision, value: data?.summary.needsDecision || 0, icon: AlertTriangle, tone: 'text-amber-300' },
        { label: t.panelUi.reviewCopy.followUp, value: data?.summary.followUp || 0, icon: Clock3, tone: 'text-sky-300' },
        { label: t.panelUi.reviewCopy.refunded, value: data?.summary.refunded || 0, icon: RotateCcw, tone: 'text-emerald-300' },
        { label: t.panelUi.reviewCopy.executed, value: data?.summary.beinExecuted || 0, icon: ShieldCheck, tone: 'text-[#9ffb06]' },
    ], [data, t])

    const verifyCard = async (item: FinancialReviewItem) => {
        if (mutationPending.current || loading || readError !== null) return
        mutationPending.current = true
        setError(null)
        setBusyOperationId(item.id)
        try {
            const response = await withRequestDeadline(signal => fetch(`/api/admin/financial-review/${item.id}/verify-card`, {
                method: 'POST', signal,
            }))
            if (!response.ok) throw new Error(t.panelUi.actionFailed)
            await fetchItems()
        } catch (err) {
            setError(err instanceof Error && err.message === t.panelUi.actionFailed ? err.message : t.panelUi.actionFailed)
        } finally {
            mutationPending.current = false
            setBusyOperationId(null)
        }
    }

    const submitDecision = async (
        note: string,
        paymentStatus?: FinancialReviewPaymentStatus,
        manualFulfillmentEvidence?: ManualFulfillmentEvidencePayload
    ) => {
        if (!dialog || mutationPending.current || readError !== null) return
        const hasAutomatedCompositeProof =
            dialog.item.evidence.fulfillmentVerified &&
            Boolean(dialog.item.evidence.fulfillmentProofId) &&
            dialog.item.evidence.fulfillmentAuthority === 'AUTOMATED_COMPOSITE'
        if (
            dialog.action === 'BEIN_EXECUTED_NO_REFUND' &&
            !hasAutomatedCompositeProof &&
            !manualFulfillmentEvidence
        ) {
            setError(t.operations.manualFulfillmentEvidenceRequired)
            return
        }
        mutationPending.current = true
        setError(null)
        setBusyOperationId(dialog.item.id)
        try {
            const { response, payload } = await withRequestDeadline(async signal => {
            const response = await fetch(`/api/admin/financial-review/${dialog.item.id}/decision`, {
                signal,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: dialog.action,
                    note,
                    decisionKey: dialog.decisionKey,
                    sourceReference: manualFulfillmentEvidence?.sourceReference,
                    ...(dialog.action === 'BEIN_EXECUTED_NO_REFUND'
                        ? {
                            manualVerification: {
                                paymentStatus: paymentStatus || 'تم تأكيد الدفع'
                            },
                            manualFulfillmentEvidence,
                        }
                        : {}),
                    ...(dialog.action === 'REFUND_CUSTOMER'
                        ? { manualVerification: { cardRenewed: false, paymentStatus: paymentStatus || 'لم يتم تأكيد الدفع' } }
                        : {}),
                }),
            })
            const payload = await response.json().catch(() => ({}))
            return { response, payload }
            })
            if (!response.ok) throw new Error(payload.error === 'INVALID_DECISION_NOTE'
                ? t.admin.financialReview.decisionNoteValidation : response.status === 409
                    ? t.admin.financialReview.capabilityChanged : t.admin.financialReview.evidenceHold)
            await fetchItems()
            setDialog(null)
            if (payload.remainingHolds > 0) setError(t.admin.financialReview.evidenceHold)
        } catch (err) {
            setError(err instanceof Error && [t.admin.financialReview.decisionNoteValidation, t.admin.financialReview.capabilityChanged, t.admin.financialReview.evidenceHold].includes(err.message) ? err.message : t.panelUi.actionFailed)
        } finally {
            mutationPending.current = false
            setBusyOperationId(null)
        }
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6" dir={dir}>
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <button className="review-button review-button-danger" disabled={loading || readError !== null || busyOperationId !== null}
                        onClick={() => setReleaseCard('')}>{t.admin.financialReview.releaseAction}</button>
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
                            <AlertTriangle className="h-4 w-4" />
                            {t.panelUi.reviewCopy.suspectOnly}
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">{t.panelUi.reviewCopy.reviewTitle}</h1>
                            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                                {t.panelUi.reviewCopy.reviewHint}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={fetchItems}
                        disabled={loading || busyOperationId !== null}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        {t.panelUi.reviewCopy.refreshList}
                    </button>
                </header>

                {data && readError === null && <section className="grid gap-3 md:grid-cols-4">
                    {summaryCards.map((card) => {
                        const Icon = card.icon
                        return (
                            <div key={card.label} className="rounded-lg border border-border bg-card p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-muted-foreground">{card.label}</span>
                                    <Icon className={`h-5 w-5 ${card.tone}`} />
                                </div>
                                <div className="mt-3 text-3xl font-bold text-foreground">{card.value}</div>
                            </div>
                        )
                    })}
                </section>}

                <section className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-2">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setState(tab.id); setCursor(''); setPreviousCursors([]) }}
                                    disabled={busyOperationId !== null}
                                    className={`rounded-lg border px-4 py-2 text-sm transition ${state === tab.id
                                        ? 'border-[#9ffb06]/60 bg-[#9ffb06]/10 text-[#9ffb06]'
                                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="relative min-w-0 lg:w-[420px]">
                            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                disabled={busyOperationId !== null}
                                onChange={(event) => { setSearch(event.target.value); setCursor(''); setPreviousCursors([]) }}
                                placeholder={t.panelUi.reviewCopy.search}
                                className="h-11 w-full rounded-lg border border-border bg-background pr-10 pl-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                            />
                        </div>
                    </div>
                </section>

                {error && !dialog && (
                    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                        {error}
                    </div>
                )}

                {readError !== null && <PanelLoadError status={readError} retry={fetchItems} />}
                {loading && data && <p role="status">{t.common.loading} {t.panelUi.staleData}</p>}
                {readError === null && <section className="flex flex-col gap-4">
                    {loading && !data ? (
                        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
                            {t.panelUi.reviewCopy.loading}
                        </div>
                    ) : data?.items.length ? (
                        data.items.map((item) => (
                            <ReviewCard
                                key={item.id}
                                item={item}
                                busy={busyOperationId !== null || loading}
                                onVerify={() => verifyCard(item)}
                                onDecision={(action) => { if (!mutationPending.current && !loading) { setError(null);
                                    if (action === 'ADMIN_ARCHIVE_AND_UNLOCK_CARD') setReleaseCard(item.cardNumber)
                                    else setDialog({ item, action, decisionKey: crypto.randomUUID() }) } }}
                            />
                        ))
                    ) : (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-8 text-center text-emerald-200">
                            {t.panelUi.reviewCopy.noOperations}
                        </div>
                    )}
                </section>}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>{t.renewalHold.holdPageSummary}</span>
                    <button className="review-button" disabled={loading || busyOperationId !== null || !previousCursors.length}
                        onClick={() => { setCursor(previousCursors.at(-1) || ''); setPreviousCursors(previousCursors.slice(0, -1)) }}>{t.pagination.previous}</button>
                    <button className="review-button" disabled={loading || busyOperationId !== null || readError !== null || !data?.nextCursor}
                        onClick={() => { setPreviousCursors([...previousCursors, cursor]); setCursor(data?.nextCursor || '') }}>{t.pagination.next}</button>
                </div>
            </div>

            {releaseCard !== null && readError === null && <CardReleaseDialog initialCard={releaseCard}
                onClose={() => setReleaseCard(null)} onComplete={() => { void fetchItems() }} />}
            {dialog && dialog.action !== 'ADMIN_ARCHIVE_AND_UNLOCK_CARD' && readError === null && (
                <DecisionDialog
                    state={dialog}
                    busy={busyOperationId === dialog.item.id}
                    onClose={() => { if (!mutationPending.current) setDialog(null) }}
                    error={error}
                    onSubmit={submitDecision}
                />
            )}
        </div>
    )
}

function ReviewCard({
    item,
    busy,
    onVerify,
    onDecision,
}: {
    item: FinancialReviewItem
    busy: boolean
    onVerify: () => void
    onDecision: (action: FinancialReviewDecisionAction) => void
}) {
    const { t, locale, dir } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const owner = item.user || item.customer
    const latestCheck = item.review.latestCardVerification
    const latestDecision = item.review.latestDecision
    const canDecide = item.state === 'needs_decision' || item.state === 'follow_up' ||
        item.capabilities?.allowedActions.includes('ADMIN_ARCHIVE_AND_UNLOCK_CARD') === true ||
        item.capabilities?.allowedActions.includes('RESOLVE_PRE_MUTATION') === true
    const allowed = (action: FinancialReviewDecisionAction) => item.capabilities?.allowedActions.includes(action) === true
    const beinAccountName =
        item.evidence.beinAccountLabel ||
        item.evidence.beinUsername ||
        item.beinAccount?.label ||
        item.beinAccount?.username ||
        '-'
    const beinDebitStatus = item.evidence.beinDebitConfirmed ? t.panelUi.reviewCopy.trustedEvidence : t.panelUi.reviewCopy.noTrustedEvidence
    const fulfillmentAuthorityLabel = item.evidence.fulfillmentAuthority === 'AUTOMATED_COMPOSITE'
        ? t.operations.automatedFulfillmentConfirmed
        : item.evidence.fulfillmentAuthority === 'MANUAL_PROVIDER_CONFIRMATION'
            ? t.operations.manualFulfillmentConfirmed
            : t.admin.financialReview.noFulfillmentAuthority
    const manualEvidenceSourceLabel = item.manualFulfillmentEvidence?.evidenceSource === 'SBS_SOLD_REPORT_AND_ACTIVE_CONTRACT'
        ? t.admin.financialReview.sourceSoldReportAndContract
        : item.manualFulfillmentEvidence?.evidenceSource === 'SBS_INVOICE_DETAILS_AND_ACTIVE_CONTRACT'
            ? t.admin.financialReview.sourceInvoiceDetailsAndContract
            : item.manualFulfillmentEvidence?.evidenceSource === 'BEIN_SUPPORT_CONFIRMATION'
                ? t.admin.financialReview.sourceBeinSupport
                : item.manualFulfillmentEvidence?.evidenceSource || '-'

    return (
        <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-200">
                            {getTabs(t).find(tab => tab.id === item.state)?.label}
                        </span>
                        <span className="rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
                            {item.type}
                        </span>
                        <span className="rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleString(locale)}
                        </span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">{t.panelUi.reviewCopy.card} {item.cardNumber}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{item.state === 'archived' ? t.operations.administrativelyArchived : item.hold
                            ? t.renewalHold.holdReasons[item.hold.blockReason] : item.evidence.reason}</p>
                        {item.hold && <p className="mt-1 text-sm text-muted-foreground">
                            {t.renewalHold.holdStage}: {t.renewalHold.holdStages[item.hold.stage]} · {t.renewalHold.holdLastChecked}: {new Date(item.hold.lastCheckedAt).toLocaleString(locale)}
                        </p>}
                        {item.hold?.issueTypes?.map(kind => <p key={kind} className="mt-1 text-sm text-amber-300">{t.renewalHold.issueReasons[kind]}</p>)}
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <Info label={t.panelUi.reviewCopy.customer} value={owner?.username || '-'} />
                        <Info label={t.panelUi.reviewCopy.userDeduction} value={formatUsd(item.evidence.userDeductTotal ?? item.amount)} />
                        <Info label={t.panelUi.reviewCopy.selectedPackage} value={item.packageName || '-'} />
                        <Info label={t.panelUi.reviewCopy.beinAccount} value={beinAccountName} />
                        <Info label={t.panelUi.reviewCopy.evidenceStatus} value={item.evidence.providerEvidenceLabel || beinDebitStatus} />
                        <Info label={t.panelUi.reviewCopy.confirmedDebit} value={formatUsd(item.evidence.beinDebitAmount)} />
                        <Info label={t.admin.financialReview.fulfillmentAuthority} value={fulfillmentAuthorityLabel} />
                    </div>
                </div>

                {canDecide ? (
                    <div className="flex flex-wrap gap-2 xl:max-w-[460px] xl:justify-end">
                        {allowed('ADMIN_ARCHIVE_AND_UNLOCK_CARD') && <button disabled={busy} className="review-button review-button-danger"
                            onClick={() => onDecision('ADMIN_ARCHIVE_AND_UNLOCK_CARD')}>{t.admin.financialReview.releaseAction}</button>}
                        <button onClick={onVerify} disabled={busy || item.status !== 'REVIEW_REQUIRED'} className="review-button">
                            <ShieldCheck className="h-4 w-4" />
                            {t.admin.financialReview.liveCheckAction}
                        </button>
                        <button onClick={() => onDecision('BEIN_EXECUTED_NO_REFUND')} disabled={busy || !allowed('BEIN_EXECUTED_NO_REFUND')} className="review-button review-button-success disabled:opacity-40">
                            <CheckCircle2 className="h-4 w-4" />
                            {t.admin.financialReview.completeAction}
                        </button>
                        <button onClick={() => onDecision('REFUND_CUSTOMER')} disabled={busy || !allowed('REFUND_CUSTOMER')} className="review-button review-button-danger disabled:opacity-40">
                            <Wallet className="h-4 w-4" />
                            {t.admin.financialReview.refundAction}
                        </button>
                        <button onClick={() => onDecision('KEEP_UNDER_REVIEW')} disabled={busy || !allowed('KEEP_UNDER_REVIEW')} className="review-button">
                            <Clock3 className="h-4 w-4" />
                            {t.admin.financialReview.followUpAction}
                        </button>
                        {allowed('RESOLVE_PRE_MUTATION') && (
                            <button onClick={() => onDecision('RESOLVE_PRE_MUTATION')} disabled={busy} className="review-button">
                                {t.admin.financialReview.preMutationTitle}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={`rounded-lg border px-4 py-3 text-sm xl:max-w-[360px] ${item.hold ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'}`}>
                        {item.hold ? t.admin.financialReview.evidenceHold : t.panelUi.reviewCopy.decisionLocked}
                    </div>
                )}
            </div>

            {item.administrativeRelease && <div className="mt-4 rounded-lg border border-border p-3 text-sm">
                <strong>{item.administrativeRelease.state === 'COMPLETED' ? t.admin.financialReview.archivedTab : t.admin.financialReview.releaseDraining}</strong>
                <p>{t.admin.financialReview.releaseActor}: {item.administrativeRelease.actor.username} · {new Date(item.administrativeRelease.requestedAt).toLocaleString(locale)}</p>
                <p className="whitespace-pre-wrap break-words">{item.administrativeRelease.note}</p>
                {item.lateProviderObservations?.map((observation, index) => <p key={index} className="mt-2 text-amber-300">
                    {observation.resultCode?.includes('EXPLICIT_SALE_SUCCESS') ? t.admin.financialReview.releaseLateSuccess : t.admin.financialReview.releaseLateObservation}
                    {observation.finishedAt && <span> · {new Date(observation.finishedAt).toLocaleString(locale)}</span>}
                </p>)}
            </div>}
            {item.capabilities && !item.administrativeRelease && (
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm" role="status">
                    <strong>{t.admin.financialReview.classifications[item.capabilities.classification]}</strong>
                    {item.capabilities.blockedReasonCodes.length > 0 && <p className="mt-1 text-muted-foreground">
                        {item.capabilities.classification === 'INSTALLMENT' ? t.admin.financialReview.installmentHold
                            : item.capabilities.classification === 'LEGACY_RENEWAL' ? t.admin.financialReview.legacyHold
                            : item.capabilities.classification === 'CONFLICT' ? t.admin.financialReview.fundingHold
                            : t.admin.financialReview.evidenceHold}
                    </p>}
                </div>
            )}

            {latestCheck && (
                <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/10 p-3 text-sm text-sky-100">
                    {t.panelUi.reviewCopy.lastCheck} {latestCheck.summary}
                </div>
            )}

            {latestDecision && (
                <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                    <div className="font-semibold">
                        {t.panelUi.reviewCopy.lastDecision} {latestDecision.paymentStatus || item.stateLabel}
                    </div>
                    {latestDecision.note && (
                        <div className="mt-1 text-emerald-50/90">
                            {t.panelUi.reviewCopy.adminNote} {latestDecision.note}
                        </div>
                    )}
                </div>
            )}

            {item.manualFulfillmentEvidence && (
                <section
                    className="mt-4 rounded-lg border border-violet-400/25 bg-violet-400/10 p-4"
                    aria-label={t.admin.financialReview.manualEvidenceTitle}
                    dir={dir}
                >
                    <div>
                        <h3 className="font-semibold text-violet-100">
                            {t.admin.financialReview.manualEvidenceTitle}
                        </h3>
                        <p className="mt-1 text-sm text-violet-100/80">
                            {t.operations.manualFulfillmentConfirmed}
                        </p>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <Info label={t.admin.financialReview.invoiceNo} value={item.manualFulfillmentEvidence.invoiceNo} valueDir="ltr" />
                        <Info label={t.admin.financialReview.beinAccountId} value={item.manualFulfillmentEvidence.beinAccountId} valueDir="ltr" />
                        <Info label={t.admin.financialReview.cardNumberSnapshot} value={item.manualFulfillmentEvidence.cardNumberSnapshot} valueDir="ltr" />
                        <Info label={t.admin.financialReview.packageNameSnapshot} value={item.manualFulfillmentEvidence.packageNameSnapshot} />
                        <Info
                            label={t.admin.financialReview.providerAmount}
                            value={`${item.manualFulfillmentEvidence.currency} ${item.manualFulfillmentEvidence.providerAmount}`}
                            valueDir="ltr"
                        />
                        <Info label={t.admin.financialReview.evidenceSource} value={manualEvidenceSourceLabel} />
                        <Info
                            label={t.admin.financialReview.observedAt}
                            value={new Date(item.manualFulfillmentEvidence.observedAt).toLocaleString(locale)}
                        />
                        <Info label={t.admin.financialReview.actorUserId} value={item.manualFulfillmentEvidence.actorUserId} valueDir="ltr" />
                        <Info label={t.admin.financialReview.manualEvidenceId} value={item.manualFulfillmentEvidence.id} valueDir="ltr" />
                        <div className="sm:col-span-2 xl:col-span-3">
                            <Info label={t.admin.financialReview.evidenceNote} value={item.manualFulfillmentEvidence.evidenceNote} />
                        </div>
                    </div>
                </section>
            )}

            {!item.evidence.beinDebitConfirmed && (
                <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
                    {item.evidence.providerEvidenceLabel}{t.panelUi.reviewCopy.checkBeforeDecision}
                </div>
            )}

            {item.evidence.legacyStoredBeinDebitAmount !== null && (
                <div className="mt-4 rounded-lg border border-yellow-400/25 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                    {t.panelUi.reviewCopy.oldAmountPrefix} {formatUsd(item.evidence.legacyStoredBeinDebitAmount)}{t.panelUi.reviewCopy.oldAmountSuffix}
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <button onClick={() => setExpanded((value) => !value)} className="review-button">
                    {expanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {expanded ? t.panelUi.reviewCopy.hideDetails : t.panelUi.reviewCopy.showDetails}
                </button>
                <button
                    onClick={() => navigator.clipboard?.writeText(item.id)}
                    className="review-button"
                >
                    <Copy className="h-4 w-4" />
                    {t.panelUi.reviewCopy.copyId}
                </button>
                <Link href={`/dashboard/history?search=${encodeURIComponent(item.id)}`} className="review-button">
                    {t.panelUi.reviewCopy.openOriginal}
                </Link>
            </div>

            {expanded && (
                <div className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                    <Info label={t.panelUi.reviewCopy.operationId} value={shortId(item.id)} />
                    <Info label={t.panelUi.reviewCopy.reviewReason} value={item.evidence.reasonCode || '-'} />
                    <Info label={t.panelUi.reviewCopy.previousRefund} value={item.evidence.hasRefund ? t.panelUi.reviewCopy.yes : t.panelUi.reviewCopy.no} />
                    <Info label={t.panelUi.reviewCopy.userDeduction} value={formatUsd(item.evidence.userDeductTotal)} />
                    <Info label={t.panelUi.reviewCopy.userBalance} value={`${formatAmount(item.evidence.userBalanceBefore)} -> ${formatAmount(item.evidence.userBalanceAfter)}`} />
                    <Info label={t.panelUi.reviewCopy.beinAccount} value={beinAccountName} />
                    <Info label={t.panelUi.reviewCopy.beinBefore} value={formatUsd(item.evidence.beinBalanceBefore)} />
                    <Info label={t.panelUi.reviewCopy.beinAfter} value={formatUsd(item.evidence.beinBalanceAfter)} />
                    <Info label={t.panelUi.reviewCopy.evidenceStatus} value={item.evidence.providerEvidenceLabel || beinDebitStatus} />
                    <Info label={t.panelUi.reviewCopy.confirmedDebit} value={formatUsd(item.evidence.beinDebitAmount)} />
                    <Info label={t.panelUi.reviewCopy.difference} value={formatUsd(item.evidence.differenceAmount)} />
                    <Info label={t.panelUi.reviewCopy.legacyAmount} value={formatUsd(item.evidence.legacyStoredBeinDebitAmount)} />
                    <Info label={t.panelUi.reviewCopy.evidenceSource} value={getBeinDebitSourceLabel(item.evidence.beinDebitSource, t)} />
                    <Info label={t.panelUi.reviewCopy.confidence} value={item.evidence.beinEvidenceConfidence || '-'} />
                    <Info label={t.panelUi.reviewCopy.systemMessage} value={item.evidence.responseMessage || '-'} />
                    <Info label={t.panelUi.reviewCopy.evidenceTime} value={item.evidence.capturedAt ? new Date(item.evidence.capturedAt).toLocaleString('ar-EG') : '-'} />
                </div>
            )}
        </article>
    )
}

function Info({
    label,
    value,
    valueDir = 'auto',
}: {
    label: string
    value: string
    valueDir?: 'auto' | 'ltr' | 'rtl'
}) {
    return (
        <div className="min-w-0 rounded-md border border-border bg-background/70 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div dir={valueDir} className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
        </div>
    )
}

function DecisionDialog({
    state,
    busy,
    error,
    onClose,
    onSubmit,
}: {
    state: NonNullable<DecisionDialogState>
    busy: boolean
    error: string | null
    onClose: () => void
    onSubmit: (
        note: string,
        paymentStatus?: FinancialReviewPaymentStatus,
        manualFulfillmentEvidence?: ManualFulfillmentEvidencePayload
    ) => void
}) {
    const [note, setNote] = useState('')
    const [sourceReference, setSourceReference] = useState('')
    const legacy = state.item.capabilities?.classification === 'LEGACY_RENEWAL'
    const [manualEvidence, setManualEvidence] = useState<ManualFulfillmentEvidenceDraft>(() =>
        createManualEvidenceDraft(state.item)
    )
    const { t } = useTranslation()
    const hasAutomatedCompositeProof =
        state.item.evidence.fulfillmentVerified &&
        Boolean(state.item.evidence.fulfillmentProofId) &&
        state.item.evidence.fulfillmentAuthority === 'AUTOMATED_COMPOSITE'
    const requiresManualEvidence =
        state.action === 'BEIN_EXECUTED_NO_REFUND' && !hasAutomatedCompositeProof
    const amountIsValid = /^\d+(?:\.\d{1,2})?$/.test(manualEvidence.providerAmount.trim()) &&
        Number(manualEvidence.providerAmount) > 0
    const observedAtDate = manualEvidence.observedAt ? new Date(manualEvidence.observedAt) : null
    const observedAtIsValid = observedAtDate !== null && Number.isFinite(observedAtDate.getTime())
    const hasLockedOperationContext = Boolean(
        manualEvidence.beinAccountId.trim() && manualEvidence.cardNumberSnapshot.trim()
    )
    const manualEvidenceComplete = Boolean(
        manualEvidence.invoiceNo.trim() &&
        hasLockedOperationContext &&
        manualEvidence.packageNameSnapshot.trim() &&
        amountIsValid &&
        manualEvidence.evidenceSource.trim() &&
        manualEvidence.evidenceNote.trim() &&
        observedAtIsValid && (!legacy || sourceReference.trim().length > 0)
    )

    function updateManualEvidence<K extends keyof ManualFulfillmentEvidenceDraft>(
        field: K,
        value: ManualFulfillmentEvidenceDraft[K]
    ) {
        setManualEvidence((current) => ({ ...current, [field]: value }))
    }

    function submit() {
        if (!validDecisionNote(note, state.action !== 'KEEP_UNDER_REVIEW')) return
        if (requiresManualEvidence) {
            if (!manualEvidenceComplete || !observedAtDate) return
            onSubmit(note, 'تم تأكيد الدفع', {
                ...(legacy ? { sourceReference: sourceReference.trim() } : {}),
                invoiceNo: manualEvidence.invoiceNo.trim(),
                beinAccountId: manualEvidence.beinAccountId.trim(),
                cardNumberSnapshot: manualEvidence.cardNumberSnapshot.trim(),
                packageNameSnapshot: manualEvidence.packageNameSnapshot.trim(),
                providerAmount: manualEvidence.providerAmount.trim(),
                currency: manualEvidence.currency,
                evidenceSource: manualEvidence.evidenceSource.trim(),
                evidenceNote: manualEvidence.evidenceNote.trim(),
                observedAt: observedAtDate.toISOString(),
            })
            return
        }
        onSubmit(note, copy.paymentStatus || undefined)
    }

    const copy = {
        ADMIN_ARCHIVE_AND_UNLOCK_CARD: {
            title: t.admin.financialReview.releaseAction, body: t.admin.financialReview.releaseWarning,
            confirm: t.admin.financialReview.releaseAction, paymentStatus: null,
        },
        RESOLVE_PRE_MUTATION: {
            title: t.admin.financialReview.preMutationTitle,
            body: t.admin.financialReview.preMutationDescription,
            confirm: t.admin.financialReview.preMutationTitle,
            paymentStatus: null,
        },
        BEIN_EXECUTED_NO_REFUND: {
            title: t.admin.financialReview.manualDecisionTitle,
            body: t.admin.financialReview.manualDecisionDescription,
            confirm: t.admin.financialReview.manualDecisionConfirm,
            paymentStatus: 'تم تأكيد الدفع' as FinancialReviewPaymentStatus,
        },
        REFUND_CUSTOMER: {
            title: t.admin.financialReview.refundAction,
            body: t.admin.financialReview.refundDescription,
            confirm: t.admin.financialReview.refundConfirm,
            paymentStatus: 'لم يتم تأكيد الدفع' as FinancialReviewPaymentStatus,
        },
        KEEP_UNDER_REVIEW: {
            title: t.admin.financialReview.followUpAction,
            body: t.admin.financialReview.followUpDescription,
            confirm: t.admin.financialReview.followUpConfirm,
            paymentStatus: null,
        },
    }[state.action]

    return (
        <PanelDialog title={copy.title} onClose={onClose} busy={busy} className="max-w-2xl">
            <div className="w-full rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 id="financial-review-decision-title" className="text-xl font-bold text-foreground">{copy.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                    {t.panelUi.reviewCopy.card} {state.item.cardNumber} - {t.panelUi.reviewCopy.amount} {formatAmount(state.item.amount)} USD
                </div>
                {copy.paymentStatus && (
                    <div className="mt-4 rounded-lg border border-[#9ffb06]/25 bg-[#9ffb06]/10 p-3 text-sm text-foreground">
                        <div className="text-xs text-muted-foreground">{t.panelUi.reviewCopy.paymentToSave}</div>
                        <div className="mt-1 font-semibold text-[#9ffb06]">{copy.paymentStatus === 'تم تأكيد الدفع' ? t.panelUi.reviewCopy.paymentConfirmed : t.panelUi.reviewCopy.paymentUnconfirmed}</div>
                    </div>
                )}
                {requiresManualEvidence && (
                    <div
                        className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4"
                        aria-describedby="manual-fulfillment-evidence-help"
                    >
                        <h4 className="font-semibold text-foreground">
                            {t.admin.financialReview.manualEvidenceFormTitle}
                        </h4>
                        <p id="manual-fulfillment-evidence-help" className="mt-1 text-sm text-muted-foreground">
                            {t.admin.financialReview.manualEvidenceFormDescription}
                        </p>

                        {!hasLockedOperationContext && (
                            <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                                {t.admin.financialReview.missingOperationContext}
                            </div>
                        )}

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <label className="block text-sm font-medium text-foreground">
                                {t.admin.financialReview.invoiceNo}
                                <input
                                    value={manualEvidence.invoiceNo}
                                    onChange={(event) => updateManualEvidence('invoiceNo', event.target.value)}
                                    autoFocus
                                    required
                                    maxLength={100}
                                    autoComplete="off"
                                    dir="ltr"
                                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                                    placeholder={t.admin.financialReview.invoiceNoPlaceholder}
                                />
                            </label>
                            <label className="block text-sm font-medium text-foreground">
                                {t.admin.financialReview.beinAccountId}
                                <input
                                    value={manualEvidence.beinAccountId}
                                    readOnly
                                    aria-readonly="true"
                                    dir="ltr"
                                    className="mt-2 h-11 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm text-muted-foreground outline-none"
                                />
                            </label>
                            <label className="block text-sm font-medium text-foreground">
                                {t.admin.financialReview.cardNumberSnapshot}
                                <input
                                    value={manualEvidence.cardNumberSnapshot}
                                    readOnly
                                    aria-readonly="true"
                                    dir="ltr"
                                    className="mt-2 h-11 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm text-muted-foreground outline-none"
                                />
                            </label>
                            <label className="block text-sm font-medium text-foreground">
                                {t.admin.financialReview.packageNameSnapshot}
                                <input
                                    value={manualEvidence.packageNameSnapshot}
                                    onChange={(event) => updateManualEvidence('packageNameSnapshot', event.target.value)}
                                    required
                                    maxLength={300}
                                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                                />
                            </label>
                            <label className="block text-sm font-medium text-foreground">
                                {t.admin.financialReview.providerAmount}
                                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0.01"
                                        step="0.01"
                                        value={manualEvidence.providerAmount}
                                        onChange={(event) => updateManualEvidence('providerAmount', event.target.value)}
                                        required
                                        dir="ltr"
                                        className="h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                                        placeholder={t.admin.financialReview.providerAmountPlaceholder}
                                    />
                                    <input
                                        value={manualEvidence.currency}
                                        readOnly
                                        aria-label={t.admin.financialReview.currency}
                                        dir="ltr"
                                        className="h-11 rounded-lg border border-border bg-secondary/40 px-3 text-center text-sm font-semibold text-muted-foreground outline-none"
                                    />
                                </div>
                                {(state.item.packagePrice ?? state.item.evidence.selectedPackagePrice) !== null && (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                        {t.admin.financialReview.expectedPackageAmount}: {formatUsd(
                                            state.item.packagePrice ?? state.item.evidence.selectedPackagePrice
                                        )}
                                    </span>
                                )}
                            </label>
                            <label className="block text-sm font-medium text-foreground">
                                {t.admin.financialReview.observedAt}
                                <input
                                    type="datetime-local"
                                    value={manualEvidence.observedAt}
                                    onChange={(event) => updateManualEvidence('observedAt', event.target.value)}
                                    required
                                    dir="ltr"
                                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                                />
                            </label>
                            <label className="block text-sm font-medium text-foreground sm:col-span-2">
                                {t.admin.financialReview.evidenceSource}
                                <select
                                    value={manualEvidence.evidenceSource}
                                    onChange={(event) => updateManualEvidence('evidenceSource', event.target.value)}
                                    required
                                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                                >
                                    <option value="">{t.admin.financialReview.evidenceSourcePlaceholder}</option>
                                    {MANUAL_EVIDENCE_SOURCES.map((source) => (
                                        <option key={source} value={source}>
                                            {source === 'SBS_SOLD_REPORT_AND_ACTIVE_CONTRACT'
                                                ? t.admin.financialReview.sourceSoldReportAndContract
                                                : source === 'SBS_INVOICE_DETAILS_AND_ACTIVE_CONTRACT'
                                                    ? t.admin.financialReview.sourceInvoiceDetailsAndContract
                                                    : t.admin.financialReview.sourceBeinSupport}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block text-sm font-medium text-foreground sm:col-span-2">
                                {t.admin.financialReview.evidenceNote}
                                <textarea
                                    value={manualEvidence.evidenceNote}
                                    onChange={(event) => updateManualEvidence('evidenceNote', event.target.value)}
                                    required
                                    maxLength={2000}
                                    rows={3}
                                    className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                                    placeholder={t.admin.financialReview.evidenceNotePlaceholder}
                                />
                            </label>
                        </div>
                        <p
                            className={`mt-3 text-xs ${manualEvidenceComplete ? 'text-emerald-200' : 'text-amber-100'}`}
                            aria-live="polite"
                        >
                            {t.operations.manualFulfillmentEvidenceRequired}
                        </p>
                    </div>
                )}
                {legacy && requiresManualEvidence && <label className="mt-4 block text-sm font-medium text-foreground">
                    {t.admin.financialReview.sourceReference}
                    <input value={sourceReference} onChange={event => setSourceReference(event.target.value)}
                        required maxLength={500} className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
                </label>}
                <label className="mt-4 block text-sm font-medium text-foreground">
                    {state.action === 'KEEP_UNDER_REVIEW' ? t.common.optionalNote : t.admin.financialReview.decisionNoteRequired}
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={4}
                        required={state.action !== 'KEEP_UNDER_REVIEW'}
                        maxLength={2000}
                        aria-describedby="review-decision-note-hint"
                        className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-[#9ffb06]/60"
                        placeholder={t.admin.financialReview.decisionNotePlaceholder}
                    />
                </label>
                <p id="review-decision-note-hint" className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                    {state.action !== 'KEEP_UNDER_REVIEW' && t.admin.financialReview.decisionNoteValidation}
                </p>
                {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button onClick={onClose} disabled={busy} className="review-button w-full sm:w-auto">
                        {t.common.cancel}
                    </button>
                    <button
                        onClick={submit}
                        disabled={busy || !validDecisionNote(note, state.action !== 'KEEP_UNDER_REVIEW') ||
                            (requiresManualEvidence && !manualEvidenceComplete)}
                        className="review-button review-button-success w-full disabled:opacity-50 sm:w-auto"
                    >
                        {busy ? t.admin.financialReview.savingDecision : copy.confirm}
                    </button>
                </div>
            </div>
        </PanelDialog>
    )
}
