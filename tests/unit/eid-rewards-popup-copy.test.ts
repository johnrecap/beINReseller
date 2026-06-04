import test from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_EID_POPUP_TEXTS,
    eidRewardPopupTextsSchema,
    eidRewardSettingsSchema,
    formatEidPopupText,
    normalizeEidPopupTexts,
} from '@/lib/eid-rewards/settings'

const validTexts = {
    ...DEFAULT_EID_POPUP_TEXTS,
    title: 'Campaign title',
    beforeText: 'Before claim',
    openButtonText: 'Open now',
    openingText: 'Opening...',
    successTitle: 'Success',
    pointsText: 'You received {points} points',
    moneyPreviewText: 'Equals {amount} {currency} balance',
    afterText: 'After claim',
    redeemButtonText: 'Redeem',
    redeemingText: 'Redeeming...',
    redeemedSuccessText: 'Redeemed',
    laterButtonText: 'Later',
    alreadyClaimedText: 'Already claimed',
    claimedTodayText: 'Claimed today',
    inactiveEventText: 'Event inactive',
    genericErrorText: 'Try again',
}

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
    popupTexts: validTexts,
    tiers: [],
}

test('normalizes missing popup text bundle from legacy before and after text', () => {
    const normalized = normalizeEidPopupTexts({
        popupTexts: null,
        beforeText: 'Legacy before',
        afterText: 'Legacy after',
    })

    assert.equal(normalized.beforeText, 'Legacy before')
    assert.equal(normalized.afterText, 'Legacy after')
    assert.equal(normalized.openButtonText.length > 0, true)
    assert.equal(normalized.genericErrorText.length > 0, true)
})

test('accepts a complete popup text bundle with supported placeholders', () => {
    const parsed = eidRewardPopupTextsSchema.safeParse(validTexts)

    assert.equal(parsed.success, true)
})

test('rejects required empty popup text fields', () => {
    const parsed = eidRewardPopupTextsSchema.safeParse({
        ...validTexts,
        title: '   ',
    })

    assert.equal(parsed.success, false)
})

test('rejects unsupported placeholders outside allowed fields', () => {
    const parsed = eidRewardPopupTextsSchema.safeParse({
        ...validTexts,
        openButtonText: 'Open {points}',
    })

    assert.equal(parsed.success, false)
})

test('rejects unsupported placeholders in money preview text', () => {
    const parsed = eidRewardPopupTextsSchema.safeParse({
        ...validTexts,
        moneyPreviewText: 'Equals {amount} {currency} {unknown}',
    })

    assert.equal(parsed.success, false)
})

test('settings schema accepts audience and popup text fields', () => {
    const parsed = eidRewardSettingsSchema.safeParse({
        ...validSettings,
        audienceRoles: ['ADMIN', 'USER'],
    })

    assert.equal(parsed.success, true)
})

test('settings schema rejects invalid audience roles', () => {
    const parsed = eidRewardSettingsSchema.safeParse({
        ...validSettings,
        audienceRoles: ['ADMIN', 'OWNER'],
    })

    assert.equal(parsed.success, false)
})

test('formats popup text placeholders with runtime values', () => {
    assert.equal(formatEidPopupText('You received {points} points', { points: 75 }), 'You received 75 points')
    assert.equal(
        formatEidPopupText('Equals {amount} {currency} balance', { amount: 2.5, currency: 'USD' }),
        'Equals 2.5 USD balance'
    )
})
