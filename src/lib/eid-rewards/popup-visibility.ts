export const EID_REWARD_POPUP_HIDE_KEY = 'eid-reward-popup-hidden'

export type EidRewardPopupCloseReason = 'later' | 'redeemed'

export function shouldRememberPopupClosed(reason: EidRewardPopupCloseReason): boolean {
    return reason === 'later' || reason === 'redeemed'
}
