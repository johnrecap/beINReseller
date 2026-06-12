import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildCairoClaimDate,
    buildClaimScopeKey,
    calculateEidMoneyPreview,
    isEidEventActive,
    selectRangeReward,
    selectWeightedReward,
} from '@/lib/eid-rewards/calculation'

test('selects weighted reward at deterministic boundaries', () => {
    const tiers = [
        { points: 50, probabilityWeight: 40, isActive: true },
        { points: 100, probabilityWeight: 30, isActive: true },
        { points: 500, probabilityWeight: 10, isActive: true },
    ]

    assert.equal(selectWeightedReward(tiers, () => 1), 50)
    assert.equal(selectWeightedReward(tiers, () => 40), 50)
    assert.equal(selectWeightedReward(tiers, () => 41), 100)
    assert.equal(selectWeightedReward(tiers, () => 80), 500)
})

test('ignores inactive weighted tiers and falls back when no active weight exists', () => {
    assert.equal(selectWeightedReward([
        { points: 50, probabilityWeight: 40, isActive: false },
        { points: 100, probabilityWeight: 0, isActive: true },
    ], () => 1), null)
})

test('selects range reward inclusively', () => {
    assert.equal(selectRangeReward(50, 55, () => 50), 50)
    assert.equal(selectRangeReward(50, 55, () => 55), 55)
})

test('builds claim scope for event and Cairo day policies', () => {
    const now = new Date('2026-05-25T22:30:00.000Z')

    assert.equal(buildCairoClaimDate(now), '2026-05-26')
    assert.equal(buildClaimScopeKey('eid-2026', 'ONCE_PER_EVENT', now), 'eid-2026')
    assert.equal(buildClaimScopeKey('eid-2026', 'ONCE_PER_DAY', now), 'eid-2026:2026-05-26')
})

test('event is active only when enabled and inside date window', () => {
    const now = new Date('2026-05-26T10:00:00.000Z')

    assert.equal(isEidEventActive({
        enabled: true,
        startsAt: new Date('2026-05-26T00:00:00.000Z'),
        endsAt: new Date('2026-05-27T00:00:00.000Z'),
    }, now), true)
    assert.equal(isEidEventActive({
        enabled: false,
        startsAt: new Date('2026-05-26T00:00:00.000Z'),
        endsAt: new Date('2026-05-27T00:00:00.000Z'),
    }, now), false)
    assert.equal(isEidEventActive({
        enabled: true,
        startsAt: null,
        endsAt: new Date('2026-05-27T00:00:00.000Z'),
    }, now), false)
})

test('calculates money preview with existing points conversion ratio', () => {
    assert.equal(calculateEidMoneyPreview(250, {
        pointsEnabled: true,
        pointsStartAt: new Date('2026-05-25T00:00:00.000Z'),
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        managerOwnedUserPointsEnabled: true,
    }), 25)

    assert.equal(calculateEidMoneyPreview(250, {
        pointsEnabled: false,
        pointsStartAt: null,
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        managerOwnedUserPointsEnabled: false,
    }), null)
})
