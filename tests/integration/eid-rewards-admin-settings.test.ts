import test from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_EID_POPUP_TEXTS,
    buildEidRewardSettingsPersistence,
    eidRewardSettingsSchema,
} from '@/lib/eid-rewards/settings'

const completeSettings = {
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
    audienceRoles: ['ADMIN', 'USER'],
    popupTexts: {
        ...DEFAULT_EID_POPUP_TEXTS,
        beforeText: 'Popup before',
        afterText: 'Popup after',
        pointsText: 'Points {points}',
        moneyPreviewText: 'Money {amount} {currency}',
    },
    audienceOverrides: [
        { userId: 'user-allow', effect: 'ALLOW' },
        { userId: 'user-deny', effect: 'DENY' },
    ],
    tiers: [{ points: 50, probabilityWeight: 40, isActive: true }],
}

test('admin Eid settings validation rejects invalid active event before database writes', () => {
    const parsed = eidRewardSettingsSchema.safeParse({
        enabled: true,
        eventKey: 'eid-2026',
        startsAt: '2026-05-30T00:00:00.000Z',
        endsAt: '2026-05-26T00:00:00.000Z',
        claimPolicy: 'ONCE_PER_EVENT',
        minPoints: 50,
        maxPoints: 500,
        minRedeemPoints: 50,
        showPopupAfterLogin: true,
        allowLaterDismiss: true,
        closeDelaySeconds: 0,
        beforeText: 'Before',
        afterText: 'After',
        tiers: [{ points: 50, probabilityWeight: 40, isActive: true }],
    })

    assert.equal(parsed.success, false)
})

test('admin Eid settings validation accepts audience and popup copy controls', () => {
    const parsed = eidRewardSettingsSchema.safeParse(completeSettings)

    assert.equal(parsed.success, true)
})

test('admin Eid settings validation rejects duplicate audience override users', () => {
    const parsed = eidRewardSettingsSchema.safeParse({
        ...completeSettings,
        audienceOverrides: [
            { userId: 'dup-user', effect: 'ALLOW' },
            { userId: 'dup-user', effect: 'DENY' },
        ],
    })

    assert.equal(parsed.success, false)
})

test('admin settings persistence mirrors popup before and after text and override rows', () => {
    const parsed = eidRewardSettingsSchema.parse(completeSettings)
    const persistence = buildEidRewardSettingsPersistence(parsed, {
        adminUserId: 'admin-1',
        startsAt: new Date(parsed.startsAt!),
        endsAt: new Date(parsed.endsAt!),
    })

    assert.equal(persistence.settingsData.beforeText, 'Popup before')
    assert.equal(persistence.settingsData.afterText, 'Popup after')
    assert.deepEqual(persistence.settingsData.audienceRoles, ['ADMIN', 'USER'])
    assert.deepEqual(persistence.audienceOverrides, [
        { settingsId: 'default', userId: 'user-allow', effect: 'ALLOW' },
        { settingsId: 'default', userId: 'user-deny', effect: 'DENY' },
    ])
    assert.equal(persistence.tiers.length, 1)
})
