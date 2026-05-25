import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCashRedemptionWrites } from '@/lib/points/cash-redemption'

test('builds atomic cash redemption writes for the caller only', () => {
    const writes = buildCashRedemptionWrites({
        ownerUserId: 'user-1',
        ownerRole: 'USER',
        balanceBefore: 10,
        availablePoints: 250,
        pointsToConvert: 100,
        conversionPoints: 100,
        conversionAmountUsd: 10,
    })

    assert.deepEqual(writes, {
        ok: true,
        ownerUserId: 'user-1',
        ledgerEntry: {
            ownerUserId: 'user-1',
            ownerRoleAtTime: 'USER',
            sourceType: 'POINT_CASH_REDEMPTION',
            points: -100,
            status: 'REDEEMED',
            amountUsdSnapshot: 10,
        },
        transaction: {
            userId: 'user-1',
            type: 'DEPOSIT',
            amount: 10,
            balanceAfter: 20,
        },
    })
})

test('rejects cash redemption write plan when points are insufficient', () => {
    assert.deepEqual(buildCashRedemptionWrites({
        ownerUserId: 'user-1',
        ownerRole: 'USER',
        balanceBefore: 10,
        availablePoints: 99,
        pointsToConvert: 100,
        conversionPoints: 100,
        conversionAmountUsd: 10,
    }), { ok: false, reason: 'INSUFFICIENT_POINTS' })
})
