import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_EID_POPUP_TEXTS } from '@/lib/eid-rewards/settings'
import { buildEidRewardStatusState } from '@/lib/eid-rewards/claim'

test('status hides popup when user is outside Eid reward audience', () => {
    const state = buildEidRewardStatusState({
        active: true,
        existingClaim: false,
        showPopupAfterLogin: true,
        audienceAllowed: false,
    })

    assert.equal(state.eligible, false)
    assert.equal(state.popupShow, false)
})

test('status keeps existing eligible behavior when user is inside audience', () => {
    const state = buildEidRewardStatusState({
        active: true,
        existingClaim: false,
        showPopupAfterLogin: true,
        audienceAllowed: true,
    })

    assert.equal(state.eligible, true)
    assert.equal(state.popupShow, true)
})

test('public status shape does not expose audience rule lists', () => {
    const publicStatus = {
        eligible: false,
        audienceEligible: false,
        popup: {
            show: false,
            texts: DEFAULT_EID_POPUP_TEXTS,
        },
    }

    assert.equal('audienceRoles' in publicStatus, false)
    assert.equal('audienceOverrides' in publicStatus, false)
    assert.equal('audienceRoles' in publicStatus.popup, false)
    assert.equal('audienceOverrides' in publicStatus.popup, false)
})
