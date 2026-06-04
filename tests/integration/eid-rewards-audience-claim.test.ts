import test from 'node:test'
import assert from 'node:assert/strict'
import {
    EidRewardError,
    assertEidRewardAudienceCanClaim,
} from '@/lib/eid-rewards/claim'

test('claim audience guard rejects users outside Eid reward audience', () => {
    assert.throws(
        () => assertEidRewardAudienceCanClaim({ allowed: false, reason: 'ROLE_DENIED' }),
        (error) => error instanceof EidRewardError && error.code === 'NOT_ELIGIBLE_AUDIENCE'
    )
})

test('claim audience guard allows users inside Eid reward audience', () => {
    assert.doesNotThrow(() => assertEidRewardAudienceCanClaim({ allowed: true, reason: 'ROLE_ALLOWED' }))
})
