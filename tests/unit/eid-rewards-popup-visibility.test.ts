import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldRememberPopupClosed } from '@/lib/eid-rewards/popup-visibility'

test('remembers Eid reward popup dismissal after successful redemption', () => {
    assert.equal(shouldRememberPopupClosed('redeemed'), true)
})

test('remembers Eid reward popup dismissal when user chooses later', () => {
    assert.equal(shouldRememberPopupClosed('later'), true)
})
