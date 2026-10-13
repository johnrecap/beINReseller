'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelDialog } from '@/components/ui/dialog'
import { useTranslation } from '@/hooks/useTranslation'
import { withRequestDeadline } from '@/lib/request-deadline'
import type { cardReleasePreview } from '../../../../shared/operations/admin-card-release'

type Preview = Awaited<ReturnType<typeof cardReleasePreview>> & { pending?: { id: string; state: string } | null }
type Release = { id: string; state: string; lastError?: string | null }

export function CardReleaseDialog({ initialCard = '', onClose, onComplete }: {
    initialCard?: string; onClose(): void; onComplete(): void
}) {
    const { t, dir, locale } = useTranslation()
    const copy = t.admin.financialReview
    const [card, setCard] = useState(initialCard)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [release, setRelease] = useState<Release | null>(null)
    const [note, setNote] = useState('')
    const [acknowledged, setAcknowledged] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const decisionKey = useRef(crypto.randomUUID())
    const notified = useRef(false)
    const submitting = useRef(false)
    const mounted = useRef(true)
    const initialPreviewLoaded = useRef(false)
    useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

    const loadPreview = useCallback(async () => {
        setBusy(true); setError(null); setAcknowledged(false)
        try {
            const response = await withRequestDeadline(signal => fetch(`/api/admin/financial-review/card-release?cardNumber=${encodeURIComponent(card)}`, { signal }))
            if (response.status === 401 || response.status === 403) { onClose(); return }
            if (!response.ok) throw new Error()
            const data: Preview = await response.json()
            if (!mounted.current) return
            setPreview(data)
            if (data.pending) setRelease(data.pending)
        } catch { if (mounted.current) setError(copy.releaseRetry) }
        finally { if (mounted.current) setBusy(false) }
    }, [card, onClose, copy.releaseRetry])

    useEffect(() => {
        if (initialCard && !initialPreviewLoaded.current) {
            initialPreviewLoaded.current = true
            void loadPreview()
        }
    }, [initialCard, loadPreview])

    const releaseId = release?.id
    const releaseState = release?.state
    useEffect(() => {
        if (!releaseId || releaseState === 'COMPLETED') return
        let cancelled = false
        const timer = setInterval(async () => {
            try {
                const response = await withRequestDeadline(signal => fetch(`/api/admin/financial-review/card-release?releaseId=${encodeURIComponent(releaseId)}`, { signal }))
                if (response.status === 401 || response.status === 403) { onClose(); return }
                if (!response.ok) throw new Error()
                const next: Release = await response.json()
                if (cancelled) return
                setRelease(next)
                setError(next.lastError ? copy.releaseRetry : null)
                if (next.state === 'COMPLETED' && !notified.current) { notified.current = true; onComplete() }
            } catch { if (!cancelled) setError(copy.releaseRetry) }
        }, 2000)
        return () => { cancelled = true; clearInterval(timer) }
    }, [releaseId, releaseState, copy.releaseRetry, onClose, onComplete])

    async function submit() {
        if (submitting.current || busy || !preview?.operationId || !acknowledged || !note.trim() || note.length > 2000) return
        submitting.current = true
        setBusy(true); setError(null)
        try {
            const response = await withRequestDeadline(signal => fetch(`/api/admin/financial-review/${preview.operationId}/decision`, {
                method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ADMIN_ARCHIVE_AND_UNLOCK_CARD', decisionKey: decisionKey.current,
                    note: note.trim(), fingerprint: preview.fingerprint, acknowledgeRisk: true }),
            }))
            if (response.status === 401 || response.status === 403) { onClose(); return }
            if (!response.ok) {
                if (response.status === 409) { setPreview(null); setAcknowledged(false); throw new Error(copy.releaseChanged) }
                throw new Error(copy.releaseRetry)
            }
            const data = await response.json()
            if (!mounted.current) return
            setRelease({ id: data.releaseId, state: data.state, lastError: data.lastError })
            if (data.lastError) setError(copy.releaseRetry)
            if (data.state === 'COMPLETED' && !notified.current) { notified.current = true; onComplete() }
        } catch (cause) { if (mounted.current) setError(cause instanceof Error && cause.message === copy.releaseChanged ? copy.releaseChanged : copy.releaseRetry) }
        finally { submitting.current = false; if (mounted.current) setBusy(false) }
    }

    return <PanelDialog title={copy.releaseAction} onClose={onClose} busy={busy} className="max-w-3xl">
        <div className="space-y-4 p-5" dir={dir}>
            <h2 className="text-xl font-bold">{copy.releaseAction}</h2>
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm">{copy.releaseWarning}</p>
            {!release && <div className="flex flex-wrap gap-2">
                <label className="flex-1">{t.panelUi.reviewCopy.card}
                    <input dir="ltr" inputMode="numeric" value={card} disabled={busy} className="mt-1 w-full rounded border border-border bg-background p-2"
                        onChange={e => { setCard(e.target.value); setPreview(null); setAcknowledged(false); decisionKey.current = crypto.randomUUID() }} />
                </label>
                <button className="review-button self-end" disabled={busy || !/^\d{1,64}$/.test(card)} onClick={() => void loadPreview()}>{copy.releasePreview}</button>
            </div>}
            {preview && <section aria-label={copy.releasePreview} className="max-h-48 space-y-2 overflow-auto sm:max-h-72">
                {!preview.operations.length && <p>{copy.releaseEmpty}</p>}
                {preview.operations.map(op => <div key={op.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                    <p dir="ltr" className="break-all">{op.id}</p>
                    {op.packageName && <p dir="auto">{op.packageName}</p>}
                    <p>{copy.paymentStates[op.paymentState as keyof typeof copy.paymentStates] || copy.paymentStates.UNKNOWN}</p>
                    <p>{t.panelUi.reviewCopy.userDeduction}: <bdi>USD {String(op.customerDeducted)}</bdi> · {t.panelUi.reviewCopy.previousRefund}: <bdi>USD {String(op.customerRefunded)}</bdi></p>
                    <p>{t.renewalHold.holdStage}: {op.stage === 'FINAL_OK' || op.stage === 'FINAL_PAY'
                        ? t.renewalHold.holdStages.FINAL_PAYMENT : t.renewalHold.holdStages.UNKNOWN}</p>
                    {op.issueTypes.map(kind => <p key={kind}>{t.renewalHold.issueReasons[kind as keyof typeof t.renewalHold.issueReasons] || t.renewalHold.holdReasons.INTEGRITY_ISSUE}</p>)}
                    {op.cardReserved && <p>{t.renewalHold.holdReasons.CARD_LIFECYCLE_RESERVED}</p>}
                    {op.accountReserved && <p>{copy.releaseAccountReserved}</p>}
                    {op.cooldownUntil && <p>{t.renewalHold.holdReasons.CARD_COOLDOWN}: {new Date(op.cooldownUntil).toLocaleString(locale)}</p>}
                </div>)}
            </section>}
            {release ? <p role="status" className="rounded-lg border border-border p-3">{release.state === 'COMPLETED' ? copy.releaseComplete : copy.releaseDraining}</p>
                : <>
                    <label className="block">{copy.releaseReason}<textarea value={note} maxLength={2000} disabled={busy} onChange={e => setNote(e.target.value)} className="mt-1 min-h-24 w-full rounded border border-border bg-background p-2" /></label>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy || !preview?.operations.length} onChange={e => setAcknowledged(e.target.checked)} />{copy.releaseAcknowledgement}</label>
                    <button className="review-button review-button-danger" disabled={busy || !preview?.operations.length || !acknowledged || !note.trim()} onClick={() => void submit()}>{busy ? t.common.loading : copy.releaseAction}</button>
                </>}
            {error && <p role="alert" className="text-red-400">{error}</p>}
        </div>
    </PanelDialog>
}
