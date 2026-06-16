'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
} | null

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

    const submitDecision = async (note: string, paymentStatus?: FinancialReviewPaymentStatus) => {
        if (!dialog) return
        setBusyOperationId(dialog.item.id)
        try {
            const response = await fetch(`/api/admin/financial-review/${dialog.item.id}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: dialog.action,
                    note,
                    ...(dialog.action === 'BEIN_EXECUTED_NO_REFUND'
                        ? { manualVerification: { cardRenewed: true, paymentStatus: paymentStatus || 'تم تأكيد الدفع' } }
                        : {}),
                    ...(dialog.action === 'REFUND_CUSTOMER'
                        ? { manualVerification: { cardRenewed: false, paymentStatus: paymentStatus || 'لم يتم تأكيد الدفع' } }
                        : {}),
                }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || 'تعذر حفظ القرار')
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
                                onDecision={(action) => setDialog({ item, action })}
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
    const [expanded, setExpanded] = useState(false)
    const owner = item.user || item.customer
    const latestCheck = item.review.latestCardVerification
    const latestDecision = item.review.latestDecision
    const canDecide = item.state === 'needs_decision' || item.state === 'follow_up'
    const beinAccountName =
        item.evidence.beinAccountLabel ||
        item.evidence.beinUsername ||
        item.beinAccount?.label ||
        item.beinAccount?.username ||
        '-'
    const beinDebitStatus = item.evidence.beinDebitConfirmed ? 'نعم - دليل موثوق' : 'لا يوجد دليل موثوق'

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
                    </div>
                </div>

                {canDecide ? (
                    <div className="flex flex-wrap gap-2 xl:max-w-[460px] xl:justify-end">
                        <button onClick={onVerify} disabled={busy} className="review-button">
                            <ShieldCheck className="h-4 w-4" />
                            فحص مباشر من beIN
                        </button>
                        <button onClick={() => onDecision('BEIN_EXECUTED_NO_REFUND')} disabled={busy} className="review-button review-button-success">
                            <CheckCircle2 className="h-4 w-4" />
                            تم التجديد - بدون رد فلوس
                        </button>
                        <button onClick={() => onDecision('REFUND_CUSTOMER')} disabled={busy} className="review-button review-button-danger">
                            <Wallet className="h-4 w-4" />
                            رد فلوس للعميل
                        </button>
                        <button onClick={() => onDecision('KEEP_UNDER_REVIEW')} disabled={busy} className="review-button">
                            <Clock3 className="h-4 w-4" />
                            متابعة لاحقا
                        </button>
                    </div>
                ) : (
                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 xl:max-w-[360px]">
                        تم قفل قرار هذه العملية. القرار محفوظ في السجل ولا يحتاج إجراء جديد.
                    </div>
                )}
            </div>

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

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-md border border-border bg-background/70 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
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
    onSubmit: (note: string, paymentStatus?: FinancialReviewPaymentStatus) => void
}) {
    const [note, setNote] = useState('')
    const copy = {
        BEIN_EXECUTED_NO_REFUND: {
            title: 'تأكيد أن التجديد تم',
            body: 'استخدم هذا القرار فقط لو اتأكدت من موقع beIN أو من دليل واضح أن الكارت اتجدد بالفعل.',
            confirm: 'تأكيد بدون رد فلوس',
            paymentStatus: 'تم تأكيد الدفع' as FinancialReviewPaymentStatus,
        },
        REFUND_CUSTOMER: {
            title: 'رد فلوس للعميل',
            body: 'سيتم إضافة مبلغ العملية لرصيد العميل مرة واحدة فقط، ولن يسمح النظام برد مكرر لنفس العملية.',
            confirm: 'تنفيذ رد الفلوس',
            paymentStatus: 'لم يتم تأكيد الدفع' as FinancialReviewPaymentStatus,
        },
        KEEP_UNDER_REVIEW: {
            title: 'متابعة لاحقا',
            body: 'سيتم نقل العملية لتبويب متابعة لاحقا مع حفظ سبب التأجيل.',
            confirm: 'حفظ للمتابعة',
            paymentStatus: null,
        },
    }[state.action]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir="rtl">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
                <h3 className="text-xl font-bold text-foreground">{copy.title}</h3>
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
                <label className="mt-4 block text-sm font-medium text-foreground">
                    ملاحظة اختيارية
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={4}
                        className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-[#9ffb06]/60"
                        placeholder="اكتب أي ملاحظة إضافية لو محتاج."
                    />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onClose} disabled={busy} className="review-button">
                        إلغاء
                    </button>
                    <button
                        onClick={() => onSubmit(note, copy.paymentStatus || undefined)}
                        disabled={busy}
                        className="review-button review-button-success disabled:opacity-50"
                    >
                        {busy ? 'جاري الحفظ...' : copy.confirm}
                    </button>
                </div>
            </div>
        </div>
    )
}
