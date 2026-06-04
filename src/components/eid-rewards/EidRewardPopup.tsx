'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Gift, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
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
    const [status, setStatus] = useState<EidStatus | null>(null)
    const [claim, setClaim] = useState<ClaimResult | null>(null)
    const [viewState, setViewState] = useState<ViewState>('loadingStatus')
    const [error, setError] = useState<string | null>(null)
    const [visible, setVisible] = useState(false)

    const loadStatus = useCallback(async () => {
        setError(null)
        try {
            const response = await fetch('/api/eid-rewards/status', { cache: 'no-store' })
            if (response.status === 401) return
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || payload?.popup?.texts?.genericErrorText || 'تعذر تحميل عيدية العيد')

            setStatus(payload)
            const hidden = typeof window !== 'undefined'
                && isPopupHiddenByStorageValue(sessionStorage.getItem(EID_REWARD_POPUP_HIDE_KEY))
            if (payload.eligible && payload.popup.show && !hidden) {
                setViewState('eligible')
                setVisible(true)
            } else if (payload.alreadyClaimed) {
                setViewState('alreadyClaimed')
                setVisible(payload.active && !hidden)
            } else {
                setViewState('eventInactive')
                setVisible(false)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'حدث خطأ أثناء فتح العيدية، حاول مرة أخرى.')
            setViewState('error')
            setVisible(true)
        }
    }, [])

    useEffect(() => {
        loadStatus()
    }, [loadStatus])

    const pointsToRedeem = claim?.claim.points ?? 0
    const moneyPreview = useMemo(() => {
        const amount = claim?.claim.moneyValue ?? claim?.conversion.previewAmount ?? 0
        return amount > 0 ? amount : 0
    }, [claim])

    async function claimReward() {
        if (viewState === 'claiming') return
        setViewState('claiming')
        setError(null)

        try {
            const response = await fetch('/api/eid-rewards/claim', { method: 'POST' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || status?.popup.texts?.genericErrorText || 'حدث خطأ أثناء فتح العيدية، حاول مرة أخرى.')
            setClaim(payload)
            setStatus((current) => current ? {
                ...current,
                pointsBalance: payload.pointsBalance,
                canRedeem: Boolean(payload.conversion?.canRedeem),
                conversion: payload.conversion,
            } : current)
            setTimeout(() => setViewState('claimedSuccess'), 750)
        } catch (err) {
            setError(err instanceof Error ? err.message : status?.popup.texts?.genericErrorText || 'حدث خطأ أثناء فتح العيدية، حاول مرة أخرى.')
            setViewState('error')
        }
    }

    async function redeemPoints() {
        if (!pointsToRedeem || viewState === 'redeeming') return
        setViewState('redeeming')
        setError(null)

        try {
            const response = await fetch('/api/eid-rewards/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: pointsToRedeem }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || status?.popup.texts?.genericErrorText || 'تعذر تحويل النقاط إلى رصيد')
            setViewState('redeemedSuccess')
            closePopup('redeemed')
        } catch (err) {
            setError(err instanceof Error ? err.message : status?.popup.texts?.genericErrorText || 'تعذر تحويل النقاط إلى رصيد')
            setViewState('claimedSuccess')
        }
    }

    function closePopup(reason: EidRewardPopupCloseReason) {
        if (shouldRememberPopupClosed(reason)) {
            sessionStorage.setItem(EID_REWARD_POPUP_HIDE_KEY, popupClosedStorageValue(reason))
        }
        setVisible(false)
    }

    function dismissLater() {
        closePopup('later')
    }

    if (!visible || !status) return null

    const isBusy = viewState === 'claiming' || viewState === 'redeeming'
    const isSuccess = viewState === 'claimedSuccess' || viewState === 'redeeming' || viewState === 'redeemedSuccess'
    const successAction = getEidRewardSuccessAction(status.conversion.enabled)
    const texts = status.popup.texts || {
        title: 'عيد مبارك',
        beforeText: status.popup.beforeText,
        openButtonText: 'افتح العيدية الآن',
        openingText: 'جاري فتح العيدية...',
        successTitle: 'مبروك!',
        pointsText: 'حصلت على {points} نقطة',
        moneyPreviewText: 'تعادل {amount} {currency} رصيد',
        afterText: status.popup.afterText,
        redeemButtonText: 'تحويل النقاط إلى رصيد',
        redeemingText: 'جاري التحويل...',
        redeemedSuccessText: 'تم تحويل النقاط إلى رصيد بنجاح.',
        laterButtonText: 'لاحقا',
        alreadyClaimedText: 'استلمت عيديتك بالفعل',
        claimedTodayText: 'استلمت عيديتك اليوم، ارجع بكرة لعيدية جديدة',
        inactiveEventText: 'انتهت عروض العيد، تابعنا في المناسبات القادمة.',
        genericErrorText: 'حدث خطأ أثناء فتح العيدية، حاول مرة أخرى.',
    }

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                dir="rtl"
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
                                className="absolute left-0 top-0 rounded-full border border-white/15 p-2 text-white/70 hover:bg-white/10 hover:text-white"
                                aria-label="إغلاق"
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

                        {viewState === 'error' && (
                            <p className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-center text-sm text-red-100">
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
                            {viewState === 'eligible' || viewState === 'error' ? (
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
                                        تمت إضافة النقاط إلى محفظتك. تحويل النقاط إلى رصيد يحتاج تفعيل إعدادات النقاط.
                                    </p>
                                    <Button onClick={() => closePopup('redeemed')} className="bg-[#0F6B4F] text-white hover:bg-[#128461]">
                                        تم استلام الجائزة
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
        </AnimatePresence>
    )
}
