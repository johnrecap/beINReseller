import test from 'node:test'
import assert from 'node:assert/strict'
import { eidRewardSettingsSchema } from '@/lib/eid-rewards/settings'

const validSettings = {
    enabled: true,
    eventKey: 'eid-2026',
    startsAt: '2026-05-26T00:00:00.000Z',
    endsAt: '2026-05-30T00:00:00.000Z',
    claimPolicy: 'ONCE_PER_EVENT',
    minPoints: 50,
    maxPoints: 500,
    minRedeemPoints: 50,
    showPopupAfterLogin: true,
    allowLaterDismiss: true,
    closeDelaySeconds: 0,
    beforeText: 'Before',
    afterText: 'After',
    tiers: [
        { points: 50, probabilityWeight: 40, label: 'Small', isActive: true },
    ],
}

test('accepts valid Eid settings payload', () => {
    const parsed = eidRewardSettingsSchema.safeParse(validSettings)
    assert.equal(parsed.success, true)
})

test('rejects enabled settings without valid active dates', () => {
    const parsed = eidRewardSettingsSchema.safeParse({
        ...validSettings,
        startsAt: null,
    })

    assert.equal(parsed.success, false)
})

test('rejects min points greater than max points', () => {
    const parsed = eidRewardSettingsSchema.safeParse({
        ...validSettings,
        minPoints: 600,
        maxPoints: 500,
    })

    assert.equal(parsed.success, false)
})

test('rejects unsafe event key and inactive tier with invalid positive fields', () => {
    assert.equal(eidRewardSettingsSchema.safeParse({
        ...validSettings,
        eventKey: 'eid 2026!',
    }).success, false)

    assert.equal(eidRewardSettingsSchema.safeParse({
        ...validSettings,
        tiers: [{ points: 0, probabilityWeight: 1, isActive: false }],
    }).success, false)
})
