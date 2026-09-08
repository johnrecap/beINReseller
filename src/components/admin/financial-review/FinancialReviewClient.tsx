'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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

const tabs: Array<{ id: FinancialReviewState | 'all'; label: string }> = [
    { id: 'needs_decision', label: 'محتاج قرار' },
    { id: 'follow_up', label: 'متابعة لاحقا' },
    { id: 'refunded', label: 'تم رد الفلوس' },
    { id: 'bein_executed', label: 'تم التأكيد بدون رد' },
    { id: 'all', label: 'الكل' },
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

function getBeinDebitSourceLabel(source: FinancialReviewItem['evidence']['beinDebitSource']) {
    switch (source) {
        case 'ledger':
            return 'سجل خصم beIN مؤكد'
        case 'audit_snapshot':
            return 'لقطة العملية'
        case 'manual_verification':
            return 'تأكيد يدوي من الأدمن'
        case 'none':
            return 'لا يوجد دليل خصم'
    }
}

export default function FinancialReviewClient() {
    const { t } = useTranslation()
    const [state, setState] = useState<FinancialReviewState | 'all'>('needs_decision')
    const [search, setSearch] = useState('')
    const [data, setData] = useState<ApiResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dialog, setDialog] = useState<DecisionDialogState>(null)
    const [busyOperationId, setBusyOperationId] = useState<string | null>(null)

    const fetchItems = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams({
                state,
                days: '90',
                ...(search.trim() ? { q: search.trim() } : {}),
            })
            const response = await fetch(`/api/admin/financial-review?${params}`, { cache: 'no-store' })
            if (!response.ok) throw new Error('تعذر تحميل قائمة المراجعة')
            setData(await response.json())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة المراجعة')
        } finally {
            setLoading(false)
        }
    }, [search, state])

    useEffect(() => {
        fetchItems()
    }, [fetchItems])

    const summaryCards = useMemo(() => [
        { label: 'محتاج قرار', value: data?.summary.needsDecision || 0, icon: AlertTriangle, tone: 'text-amber-300' },
        { label: 'متابعة لاحقا', value: data?.summary.followUp || 0, icon: Clock3, tone: 'text-sky-300' },
        { label: 'تم رد الفلوس', value: data?.summary.refunded || 0, icon: RotateCcw, tone: 'text-emerald-300' },
        { label: 'تم التأكيد بدون رد', value: data?.summary.beinExecuted || 0, icon: ShieldCheck, tone: 'text-[#9ffb06]' },
    ], [data])

    const verifyCard = async (item: FinancialReviewItem) => {
        setBusyOperationId(item.id)
        try {
            const response = await fetch(`/api/admin/financial-review/${item.id}/verify-card`, {
                method: 'POST',
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || 'تعذر تشغيل فحص beIN المباشر')
            await fetchItems()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر تشغيل فحص beIN المباشر')
        } finally {
            setBusyOperationId(null)
        }
    }

    const submitDecision = async (
        note: string,
        paymentStatus?: FinancialReviewPaymentStatus,
        manualFulfillmentEvidence?: ManualFulfillmentEvidencePayload
    ) => {
        if (!dialog) return
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
                    ? t.admin.financialReview.capabilityChanged : payload.error || t.admin.financialReview.evidenceHold)
            setDialog(null)
            await fetchItems()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر حفظ القرار')
        } finally {
            setBusyOperationId(null)
        }
    }

    return (
        <div className="min-h-screen bg-background p-6" dir="rtl">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
                            <AlertTriangle className="h-4 w-4" />
                            العمليات المشكوك فيها فقط
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">مراجعة العمليات</h1>
                            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                                راجع بس العمليات المشكوك فيها أو غير المكتملة اللي اتخصم فيها رصيد ومحتاجين نتأكد هل التجديد تم ولا لا.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={fetchItems}
                        disabled={loading}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        تحديث القائمة
                    </button>
                </header>

                <section className="grid gap-3 md:grid-cols-4">
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
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-2">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setState(tab.id)}
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
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="بحث برقم العملية، الكارت، العميل، أو حساب beIN"
                                className="h-11 w-full rounded-lg border border-border bg-background pr-10 pl-3 text-sm text-foreground outline-none transition focus:border-[#9ffb06]/60"
                            />
                        </div>
                    </div>
                </section>

                {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                        {error}
                    </div>
                )}

                <section className="flex flex-col gap-4">
                    {loading ? (
                        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
                            جاري تحميل العمليات...
                        </div>
                    ) : data?.items.length ? (
                        data.items.map((item) => (
                            <ReviewCard
                                key={item.id}
                                item={item}
                                busy={busyOperationId === item.id}
                                onVerify={() => verifyCard(item)}
                                onDecision={(action) => setDialog({ item, action, decisionKey: crypto.randomUUID() })}
                            />
                        ))
                    ) : (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-8 text-center text-emerald-200">
                            لا توجد عمليات مشكوك فيها في هذا الفلتر.
                        </div>
                    )}
                </section>
            </div>

            {dialog && (
                <DecisionDialog
                    state={dialog}
                    busy={busyOperationId === dialog.item.id}
                    onClose={() => setDialog(null)}
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
    const canDecide = item.state === 'needs_decision' || item.state === 'follow_up'
    const allowed = (action: FinancialReviewDecisionAction) => item.capabilities?.allowedActions.includes(action) === true
    const beinAccountName =
        item.evidence.beinAccountLabel ||
        item.evidence.beinUsername ||
        item.beinAccount?.label ||
        item.beinAccount?.username ||
        '-'
    const beinDebitStatus = item.evidence.beinDebitConfirmed ? 'نعم - دليل موثوق' : 'لا يوجد دليل موثوق'
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
                            {item.stateLabel}
                        </span>
                        <span className="rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
                            {item.type}
                        </span>
                        <span className="rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleString('ar-EG')}
                        </span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">كارت {item.cardNumber}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{item.evidence.reason}</p>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <Info label="العميل" value={owner?.username || '-'} />
                        <Info label="خصم العميل من النظام" value={formatUsd(item.evidence.userDeductTotal ?? item.amount)} />
                        <Info label="الباقة المختارة" value={item.packageName || '-'} />
                        <Info label="حساب beIN المستخدم" value={beinAccountName} />
                        <Info label="حالة دليل beIN" value={item.evidence.providerEvidenceLabel || beinDebitStatus} />
                        <Info label="خصم beIN المؤكد" value={formatUsd(item.evidence.beinDebitAmount)} />
                        <Info label={t.admin.financialReview.fulfillmentAuthority} value={fulfillmentAuthorityLabel} />
                    </div>
                </div>

                {canDecide ? (
                    <div className="flex flex-wrap gap-2 xl:max-w-[460px] xl:justify-end">
                        <button onClick={onVerify} disabled={busy} className="review-button">
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
                        <button onClick={() => onDecision('KEEP_UNDER_REVIEW')} disabled={busy} className="review-button">
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
                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 xl:max-w-[360px]">
                        تم قفل قرار هذه العملية. القرار محفوظ في السجل ولا يحتاج إجراء جديد.
                    </div>
                )}
            </div>

            {item.capabilities && (
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
                    آخر فحص: {latestCheck.summary}
                </div>
            )}

            {latestDecision && (
                <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                    <div className="font-semibold">
                        آخر قرار: {latestDecision.paymentStatus || item.stateLabel}
                    </div>
                    {latestDecision.note && (
                        <div className="mt-1 text-emerald-50/90">
                            ملاحظة الأدمن: {latestDecision.note}
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
                    {item.evidence.providerEvidenceLabel}. راجع الكارت أو موقع beIN قبل القرار.
                </div>
            )}

            {item.evidence.legacyStoredBeinDebitAmount !== null && (
                <div className="mt-4 rounded-lg border border-yellow-400/25 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                    الرقم القديم المسجل من beIN هو {formatUsd(item.evidence.legacyStoredBeinDebitAmount)}، ظاهر للمراجعة فقط وليس خصما مؤكدا.
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <button onClick={() => setExpanded((value) => !value)} className="review-button">
                    {expanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                </button>
                <button
                    onClick={() => navigator.clipboard?.writeText(item.id)}
                    className="review-button"
                >
                    <Copy className="h-4 w-4" />
                    نسخ رقم العملية
                </button>
                <Link href={`/dashboard/history?search=${encodeURIComponent(item.id)}`} className="review-button">
                    فتح العملية الأصلية
                </Link>
            </div>

            {expanded && (
                <div className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                    <Info label="رقم العملية" value={shortId(item.id)} />
                    <Info label="سبب دخول المراجعة" value={item.evidence.reasonCode || '-'} />
                    <Info label="تم رد سابق؟" value={item.evidence.hasRefund ? 'نعم' : 'لا'} />
                    <Info label="خصم العميل من النظام" value={formatUsd(item.evidence.userDeductTotal)} />
                    <Info label="رصيد المستخدم قبل/بعد" value={`${formatAmount(item.evidence.userBalanceBefore)} -> ${formatAmount(item.evidence.userBalanceAfter)}`} />
                    <Info label="حساب beIN المستخدم" value={beinAccountName} />
                    <Info label="رصيد beIN قبل" value={formatUsd(item.evidence.beinBalanceBefore)} />
                    <Info label="رصيد beIN بعد" value={formatUsd(item.evidence.beinBalanceAfter)} />
                    <Info label="حالة دليل beIN" value={item.evidence.providerEvidenceLabel || beinDebitStatus} />
                    <Info label="خصم beIN المؤكد" value={formatUsd(item.evidence.beinDebitAmount)} />
                    <Info label="فرق العميل عن beIN" value={formatUsd(item.evidence.differenceAmount)} />
                    <Info label="رقم beIN قديم غير موثوق" value={formatUsd(item.evidence.legacyStoredBeinDebitAmount)} />
                    <Info label="مصدر دليل beIN" value={getBeinDebitSourceLabel(item.evidence.beinDebitSource)} />
                    <Info label="ثقة الدليل" value={item.evidence.beinEvidenceConfidence || '-'} />
                    <Info label="رسالة النظام" value={item.evidence.responseMessage || '-'} />
                    <Info label="وقت الدليل" value={item.evidence.capturedAt ? new Date(item.evidence.capturedAt).toLocaleString('ar-EG') : '-'} />
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
    onClose,
    onSubmit,
}: {
    state: NonNullable<DecisionDialogState>
    busy: boolean
    onClose: () => void
    onSubmit: (
        note: string,
        paymentStatus?: FinancialReviewPaymentStatus,
        manualFulfillmentEvidence?: ManualFulfillmentEvidencePayload
    ) => void
}) {
    const [note, setNote] = useState('')
    const [sourceReference, setSourceReference] = useState('')
    const dialogRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null
        dialogRef.current?.querySelector<HTMLElement>('input:not([readonly]), textarea, button:not(:disabled)')?.focus()
        return () => { if (previous?.isConnected) previous.focus() }
    }, [])
    const legacy = state.item.capabilities?.classification === 'LEGACY_RENEWAL'
    const [manualEvidence, setManualEvidence] = useState<ManualFulfillmentEvidenceDraft>(() =>
        createManualEvidenceDraft(state.item)
    )
    const { t, dir } = useTranslation()
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
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            dir={dir}
            role="dialog"
            ref={dialogRef}
            onKeyDown={event => {
                if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); return }
                if (event.key !== 'Tab') return
                const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') || [])]
                    .filter(control => control.getClientRects().length > 0)
                const first = controls[0], last = controls.at(-1)
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
            }}
            aria-modal="true"
            aria-labelledby="financial-review-decision-title"
        >
            <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 id="financial-review-decision-title" className="text-xl font-bold text-foreground">{copy.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                    كارت {state.item.cardNumber} - مبلغ {formatAmount(state.item.amount)} USD
                </div>
                {copy.paymentStatus && (
                    <div className="mt-4 rounded-lg border border-[#9ffb06]/25 bg-[#9ffb06]/10 p-3 text-sm text-foreground">
                        <div className="text-xs text-muted-foreground">حالة الدفع التي سيتم حفظها</div>
                        <div className="mt-1 font-semibold text-[#9ffb06]">{copy.paymentStatus}</div>
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
        </div>
    )
}
