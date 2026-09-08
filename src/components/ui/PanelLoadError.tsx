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
