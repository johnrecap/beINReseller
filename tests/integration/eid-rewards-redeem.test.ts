import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCashRedemptionWrites } from '@/lib/points/cash-redemption'

test('Eid redeem contract supports admin role through shared cash redemption writes', () => {
    const writes = buildCashRedemptionWrites({
        ownerUserId: 'admin-1',
        ownerRole: 'ADMIN',
        balanceBefore: 100,
        availablePoints: 250,
        pointsToConvert: 250,
        conversionPoints: 100,
        conversionAmountUsd: 10,
    })

    assert.equal(writes.ok, true)
    if (writes.ok) {
        assert.equal(writes.ledgerEntry.ownerRoleAtTime, 'ADMIN')
        assert.equal(writes.transaction.amount, 25)
        assert.equal(writes.transaction.balanceAfter, 125)
    }
})
