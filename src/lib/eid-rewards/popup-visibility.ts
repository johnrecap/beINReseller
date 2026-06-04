export const EID_REWARD_POPUP_HIDE_KEY = 'eid-reward-popup-hidden'

export type EidRewardPopupCloseReason = 'later' | 'redeemed'
export type EidRewardSuccessAction = 'convert-points' | 'acknowledge-points'

export function shouldRememberPopupClosed(reason: EidRewardPopupCloseReason): boolean {
    return reason === 'redeemed'
}

export function popupClosedStorageValue(reason: EidRewardPopupCloseReason): string {
    return reason
}

export function isPopupHiddenByStorageValue(value: string | null): boolean {
    return value === 'redeemed'
}

export function getEidRewardSuccessAction(conversionEnabled: boolean): EidRewardSuccessAction {
    return conversionEnabled ? 'convert-points' : 'acknowledge-points'
}
