import test from 'node:test'
import assert from 'node:assert/strict'
import { eidRewardSettingsSchema } from '@/lib/eid-rewards/settings'

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
