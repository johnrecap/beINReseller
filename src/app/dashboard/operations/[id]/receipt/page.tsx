'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'

type Receipt = {
    operationId: string
    beinInvoiceNo: string
    cardNumber: string
    itemType: string | null
    packageName: string | null
    promoCode: string | null
    providerAmount: string
    currency: string | null
    contractStartDate: string | null
    contractExpiryDate: string | null
    reportDate: string
    verifiedAt: string
    customerChargedAmount: string
}

export default function RenewalReceiptPage() {
    const { id } = useParams<{ id: string }>()
    const { t, dir } = useTranslation()
    const [result, setResult] = useState<{ id: string; receipt: Receipt | null } | null>(null)
    const loading = result?.id !== id
    const receipt = loading ? null : result.receipt

    useEffect(() => {
        const controller = new AbortController()
        fetch(`/api/operations/${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' })
            .then(async response => response.ok ? response.json() : null)
            .then(data => setResult({ id, receipt: data?.receipt || null }))
            .catch(() => { if (!controller.signal.aborted) setResult({ id, receipt: null }) })
        return () => controller.abort()
    }, [id])

    const rows = receipt ? [
        [t.renewalReceipt.operation, receipt.operationId],
        [t.renewalReceipt.invoice, receipt.beinInvoiceNo],
        [t.renewalReceipt.card, receipt.cardNumber],
        [t.renewalReceipt.itemType, receipt.itemType],
        [t.renewalReceipt.package, receipt.packageName],
        [t.renewalReceipt.promo, receipt.promoCode],
        [t.renewalReceipt.providerAmount, `${receipt.providerAmount} ${receipt.currency || ''}`],
        [t.renewalReceipt.customerAmount, `${receipt.customerChargedAmount} ${receipt.currency || ''}`],
        [t.renewalReceipt.start, receipt.contractStartDate],
        [t.renewalReceipt.expiry, receipt.contractExpiryDate],
        [t.renewalReceipt.reportDate, receipt.reportDate],
        [t.renewalReceipt.verifiedAt, new Date(receipt.verifiedAt).toLocaleString()],
    ] : []

    return <main dir={dir} className="mx-auto max-w-2xl px-4 py-8 text-foreground">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <a href="/dashboard/history" className="text-sm underline underline-offset-4">{t.renewalReceipt.back}</a>
            {receipt && <button type="button" onClick={() => window.print()}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {t.renewalReceipt.print}
            </button>}
        </div>
        <article className="rounded-xl border border-border bg-card p-5 shadow-sm print:border-0 print:shadow-none">
            <h1 className="mb-5 text-2xl font-semibold">{t.renewalReceipt.title}</h1>
            {loading ? <p role="status">{t.renewalReceipt.loading}</p>
                : !receipt ? <p role="status">{t.renewalReceipt.unavailable}</p>
                    : <dl className="divide-y divide-border">{rows.map(([label, value]) =>
                        <div key={label} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-2 sm:gap-4">
                            <dt className="text-sm text-muted-foreground">{label}</dt>
                            <dd className="min-w-0 break-words text-sm font-medium" dir="auto">{value || '—'}</dd>
                        </div>)}</dl>}
        </article>
    </main>
}
