'use client'
import { useTranslation } from '@/hooks/useTranslation'

export function PanelLoadError({ status, retry }: { status: number; retry: () => void }) {
    const { t } = useTranslation()
    return <div role="alert" className="rounded-xl border border-border bg-card p-6 text-foreground space-y-3">
        <p>{status === 401 ? t.panelUi.sessionExpired : status === 403 ? t.panelUi.accessDenied : t.panelUi.loadFailed}</p>
        {status === 401 ? <a href="/login" className="underline">{t.auth.loginButton}</a>
            : <button type="button" className="underline" onClick={retry}>{t.auth.tryAgain}</button>}
    </div>
}

export function PanelCommandWarning({ show, onReview, reviewing = false }: { show: boolean; onReview?: () => void; reviewing?: boolean }) {
    const { t } = useTranslation()
    return show ? <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
        <p>{onReview ? t.panelUi.commandReviewHint : t.panelUi.commandUnconfirmed}</p>
        {onReview && <button type="button" disabled={reviewing} onClick={onReview} className="mt-2 underline disabled:opacity-50">{reviewing ? t.common.loading : t.panelUi.reviewCurrentValues}</button>}
    </div> : null
}
