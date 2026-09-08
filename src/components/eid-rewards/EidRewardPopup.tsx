'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Gift, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { PanelDialog } from '@/components/ui/dialog'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { usePanelRequest, readPanelJson, PanelRequestError } from '@/hooks/usePanelRequest'
import { withRequestDeadline } from '@/lib/request-deadline'
import { useTranslation } from '@/hooks/useTranslation'
import EidRewardEnvelope from '@/components/eid-rewards/EidRewardEnvelope'
import {
    EID_REWARD_POPUP_HIDE_KEY,
    getEidRewardSuccessAction,
    isPopupHiddenByStorageValue,
    popupClosedStorageValue,
    shouldRememberPopupClosed,
    type EidRewardPopupCloseReason,
} from '@/lib/eid-rewards/popup-visibility'

type EidStatus = {
    enabled: boolean
    active: boolean
    eligible: boolean
    alreadyClaimed: boolean
    claimPolicy: 'ONCE_PER_EVENT' | 'ONCE_PER_DAY'
    pointsBalance: number
    canRedeem: boolean
    minRedeemPoints: number
    conversion: {
        enabled: boolean
        previewAmount: number
        currencyLabel: string
    }
    popup: {
        show: boolean
        allowLaterDismiss: boolean
        closeDelaySeconds: number
        beforeText: string
        afterText: string
        texts?: {
            title: string
            beforeText: string
            openButtonText: string
            openingText: string
            successTitle: string
            pointsText: string
            moneyPreviewText: string
            afterText: string
            redeemButtonText: string
            redeemingText: string
            redeemedSuccessText: string
            laterButtonText: string
            alreadyClaimedText: string
            claimedTodayText: string
            inactiveEventText: string
            genericErrorText: string
        }
    }
    message: string | null
}

type ClaimResult = {
    claim: {
        id: string
        points: number
        moneyValue: number | null
        eventKey: string
    }
    pointsBalance: number
    conversion: EidStatus['conversion'] & { canRedeem?: boolean }
    message: string
}

type ViewState =
    | 'loadingStatus'
    | 'eventInactive'
    | 'eligible'
    | 'claiming'
    | 'claimedSuccess'
    | 'alreadyClaimed'
    | 'redeeming'
    | 'redeemedSuccess'
    | 'error'

function formatPopupText(
    template: string,
    values: { points?: number; amount?: number | string; currency?: string }
) {
    return template
        .replaceAll('{points}', values.points == null ? '' : String(values.points))
        .replaceAll('{amount}', values.amount == null ? '' : String(values.amount))
        .replaceAll('{currency}', values.currency ?? '')
}

export default function EidRewardPopup() {
    const { t, dir } = useTranslation()
    const mutationPending = useRef(false)
    const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const command = useRef<AbortController | null>(null)
    const { run, error: readError, cancel } = usePanelRequest()
    useEffect(() => () => { clearTimeout(successTimer.current); command.current?.abort() }, [])
    const [status, setStatus] = useState<EidStatus | null>(null)
    const [claim, setClaim] = useState<ClaimResult | null>(null)
    const [viewState, setViewState] = useState<ViewState>('loadingStatus')
    const [error, setError] = useState<string | null>(null)
    const [visible, setVisible] = useState(false)

    const loadStatus = useCallback(() => {
        if (mutationPending.current) return
        setError(null)
        setClaim(null)
        return run(signal => readPanelJson<EidStatus>('/api/eid-rewards/status', signal), payload => {
            if (!payload?.popup || !payload.conversion) throw new PanelRequestError(0)
            setStatus(payload)
            let hidden = false
            try { hidden = isPopupHiddenByStorageValue(sessionStorage.getItem(EID_REWARD_POPUP_HIDE_KEY)) } catch { /* Storage may be unavailable. */ }
            if (payload.eligible && payload.popup.show && !hidden) {
                setViewState('eligible'); setVisible(true)
            } else if (payload.alreadyClaimed) {
                setViewState('alreadyClaimed'); setVisible(payload.active && !hidden)
            } else {
                setViewState('eventInactive'); setVisible(false)
            }
        })
    }, [run])

    useEffect(() => { void loadStatus() }, [loadStatus])
    useEffect(() => {
        if (readError !== null) {
            setStatus(null); setClaim(null)
            setVisible(readError !== 401 && readError !== 403)
        }
    }, [readError])

    const pointsToRedeem = claim?.claim.points ?? 0
    const moneyPreview = useMemo(() => {
        const amount = claim?.claim.moneyValue ?? claim?.conversion.previewAmount ?? 0
        return amount > 0 ? amount : 0
    }, [claim])

    async function claimReward() {
        if (mutationPending.current || viewState !== 'eligible') return
        mutationPending.current = true
        const request = new AbortController()
        command.current = request
        setViewState('claiming')
        setError(null)

        try {
            const payload = await withRequestDeadline(async signal => {
                const response = await fetch('/api/eid-rewards/claim', { method: 'POST', signal })
                if (!response.ok) throw new PanelRequestError(response.status)
                const data = await response.json() as ClaimResult
                if (!data.claim || !data.conversion) throw new Error('INVALID_CLAIM_RESPONSE')
                return data
            }, 45_000, request.signal)
            setClaim(payload)
            setStatus((current) => current ? {
                ...current,
                pointsBalance: payload.pointsBalance,
                canRedeem: Boolean(payload.conversion?.canRedeem),
                conversion: payload.conversion,
            } : current)
            successTimer.current = setTimeout(() => { mutationPending.current = false; setViewState('claimedSuccess') }, 750)
        } catch (err) {
            if (request.signal.aborted) return
            mutationPending.current = false
            setError(err instanceof PanelRequestError && err.status < 500 ? (status?.popup.texts?.genericErrorText || t.panelUi.actionFailed) : t.panelUi.eidPopup.unknownResult)
            setViewState('error')
        }
    }

    async function redeemPoints() {
        if (!pointsToRedeem || mutationPending.current || viewState !== 'claimedSuccess') return
        mutationPending.current = true
        const request = new AbortController()
        command.current = request
        setViewState('redeeming')
        setError(null)

        try {
            await withRequestDeadline(async signal => {
                const response = await fetch('/api/eid-rewards/redeem', {
                    method: 'POST', signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ points: pointsToRedeem }),
                })
                if (!response.ok) throw new PanelRequestError(response.status)
            }, 45_000, request.signal)
            setViewState('redeemedSuccess')
            closePopup('redeemed')
        } catch (err) {
            if (request.signal.aborted) return
            const rejected = err instanceof PanelRequestError && err.status < 500
            setError(rejected ? (status?.popup.texts?.genericErrorText || t.panelUi.actionFailed) : t.panelUi.eidPopup.unknownResult)
            if (!rejected) setClaim(null)
            setViewState(rejected ? 'claimedSuccess' : 'error')
        } finally {
            mutationPending.current = false
        }
    }

    function closePopup(reason: EidRewardPopupCloseReason) {
        if (mutationPending.current && reason !== 'redeemed') return
        cancel()
        if (shouldRememberPopupClosed(reason)) {
            try { sessionStorage.setItem(EID_REWARD_POPUP_HIDE_KEY, popupClosedStorageValue(reason)) } catch { /* Closing remains available. */ }
        }
        setVisible(false)
    }

    function dismissLater() {
        closePopup('later')
    }

    if (!visible) return null
    if (readError !== null) return <PanelDialog title={t.panelUi.eidRewards} onClose={dismissLater} className="max-w-md">
        <PanelLoadError status={readError} retry={loadStatus} />
        <Button variant="ghost" onClick={dismissLater}>{t.common.close}</Button>
    </PanelDialog>
    if (!status) return <PanelDialog title={t.panelUi.eidRewards} onClose={dismissLater} className="max-w-md">
        <p role="status" className="p-6">{t.common.loading}</p>
        <Button variant="ghost" onClick={dismissLater}>{t.common.close}</Button>
    </PanelDialog>

    const isBusy = viewState === 'claiming' || viewState === 'redeeming'
    const isSuccess = viewState === 'claimedSuccess' || viewState === 'redeeming' || viewState === 'redeemedSuccess'
    const successAction = getEidRewardSuccessAction(status.conversion.enabled)
    const texts = status.popup.texts || {
        ...t.panelUi.eidPopup,
        beforeText: status.popup.beforeText,
        afterText: status.popup.afterText,
        genericErrorText: t.panelUi.actionFailed,
    }

    return (
        <PanelDialog title={texts.title} onClose={dismissLater} busy={isBusy} className="max-w-md">
        <MotionConfig reducedMotion="user"><AnimatePresence>
            <motion.div
                className="w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                dir={dir}
            >
                <motion.div
                    className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#F6C453]/40 bg-[#071B2C] p-6 text-white shadow-2xl"
                    initial={{ y: 18, scale: 0.96 }}
                    animate={{ y: 0, scale: 1 }}
                    exit={{ y: 18, scale: 0.96 }}
                >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#0F6B4F_0%,transparent_45%)] opacity-40" />
                    <div className="relative">
                        {status.popup.allowLaterDismiss && (
                            <button
                                type="button"
                                onClick={dismissLater}
                                className="absolute start-0 top-0 rounded-full border border-white/15 p-2 text-white/70 hover:bg-white/10 hover:text-white"
                                aria-label={t.common.close}
                                disabled={isBusy}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}

                        <div className="text-center">
                            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F6C453]/15 text-[#F6C453]">
                                <Gift className="h-5 w-5" />
                            </div>
                            <h2 className="text-2xl font-bold">{texts.title}</h2>
                            {!isSuccess && viewState !== 'alreadyClaimed' && (
                                <p className="mt-3 text-sm leading-6 text-[#C9D3D0]">{texts.beforeText}</p>
                            )}
                        </div>

                        <EidRewardEnvelope state={viewState === 'claiming' ? 'opening' : isSuccess ? 'celebration' : 'idle'} />

                        {viewState === 'alreadyClaimed' && (
                            <p className="text-center text-sm text-[#C9D3D0]">
                                {status.message || (status.claimPolicy === 'ONCE_PER_DAY' ? texts.claimedTodayText : texts.alreadyClaimedText)}
                            </p>
                        )}

                        {error && (
                            <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-center text-sm text-red-100">
                                {error || texts.genericErrorText}
                            </p>
                        )}

                        {isSuccess && claim && (
                            <div className="space-y-2 text-center">
                                <p className="text-xl font-bold text-[#F6C453]">{texts.successTitle}</p>
                                <p className="text-3xl font-black">{formatPopupText(texts.pointsText, { points: claim.claim.points })}</p>
                                {moneyPreview > 0 && (
                                    <p className="text-sm text-[#C9D3D0]">
                                        {formatPopupText(texts.moneyPreviewText, { amount: moneyPreview, currency: claim.conversion.currencyLabel })}
                                    </p>
                                )}
                                <p className="text-sm text-[#C9D3D0]">{texts.afterText}</p>
                            </div>
                        )}

                        {viewState === 'redeemedSuccess' && (
                            <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-center text-sm text-emerald-100">
                                {texts.redeemedSuccessText}
                            </p>
                        )}

                        <div className="mt-6 flex flex-col gap-3">
                            {viewState === 'error' && <Button onClick={loadStatus}>{t.auth.tryAgain}</Button>}
                            {viewState === 'eligible' ? (
                                <Button onClick={claimReward} disabled={isBusy} className="bg-[#F6C453] text-[#071B2C] hover:bg-[#ffd976]">
                                    {texts.openButtonText}
                                </Button>
                            ) : null}
                            {viewState === 'claiming' && (
                                <Button disabled className="bg-[#F6C453] text-[#071B2C]">
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                    {texts.openingText}
                                </Button>
                            )}
                            {(viewState === 'claimedSuccess' || viewState === 'redeeming') && successAction === 'convert-points' && (
                                <Button onClick={redeemPoints} disabled={isBusy} className="bg-[#0F6B4F] text-white hover:bg-[#128461]">
                                    {viewState === 'redeeming' && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                                    {viewState === 'redeeming' ? texts.redeemingText : texts.redeemButtonText}
                                </Button>
                            )}
                            {viewState === 'claimedSuccess' && successAction === 'acknowledge-points' && (
                                <>
                                    <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-center text-sm text-emerald-100">
                                        {t.panelUi.eidPopup.pointsAdded}
                                    </p>
                                    <Button onClick={() => closePopup('redeemed')} className="bg-[#0F6B4F] text-white hover:bg-[#128461]">
                                        {t.panelUi.eidPopup.acknowledge}
                                    </Button>
                                </>
                            )}
                            <Button type="button" variant="outline" onClick={dismissLater} disabled={isBusy} className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                                {texts.laterButtonText}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence></MotionConfig>
        </PanelDialog>
    )
}
