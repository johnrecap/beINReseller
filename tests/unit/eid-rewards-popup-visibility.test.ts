import test from 'node:test'
import assert from 'node:assert/strict'
import {
    getEidRewardSuccessAction,
    isPopupHiddenByStorageValue,
    shouldRememberPopupClosed,
} from '@/lib/eid-rewards/popup-visibility'

test('remembers Eid reward popup dismissal after successful redemption', () => {
    assert.equal(shouldRememberPopupClosed('redeemed'), true)
})

test('does not remember Eid reward popup dismissal when user chooses later', () => {
    assert.equal(shouldRememberPopupClosed('later'), false)
})

test('ignores legacy later-dismissed popup storage values', () => {
    assert.equal(isPopupHiddenByStorageValue('1'), false)
    assert.equal(isPopupHiddenByStorageValue('redeemed'), true)
})

test('uses an acknowledgement action when point conversion is unavailable', () => {
    assert.equal(getEidRewardSuccessAction(false), 'acknowledge-points')
    assert.equal(getEidRewardSuccessAction(true), 'convert-points')
})
