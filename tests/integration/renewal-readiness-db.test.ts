import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { getRenewalReadiness, assertRenewalReadiness } from '../../src/lib/renewal-readiness'

for (const state of ['inactive', 'not-exclusive', 'available', 'cooldown', 'owned', 'foreign', 'released', 'insufficient'] as const) {
    test(`T035 actual account readiness: ${state}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            await f.db.beinAccount.update({ where: { id: f.accountId }, data: {
                isActive: state !== 'inactive', automationExclusive: state !== 'not-exclusive',
                dealerBalance: state === 'insufficient' ? 1 : 500,
                cooldownUntil: state === 'cooldown' ? new Date(Date.now() + 60000) : null,
            } })
            if (['owned', 'foreign', 'released'].includes(state)) await f.db.providerAccountCausalReservation.create({ data: {
                operationId: f.operationId, beinAccountId: f.accountId, automaticWindowEndsAt: new Date(Date.now() + 60000),
                ...(state === 'released' ? { releasedAt: new Date(), releaseReason: 'SYNTHETIC_RELEASE' } : {}),
            } })
            const operationId = state === 'foreign' ? 'another-operation' : f.operationId
            const input = { operationId, beinAccountId: f.accountId, minBalance: 174 }
            const result = await getRenewalReadiness(f.db, input)
            assert.equal(result.ready, ['available', 'owned', 'released'].includes(state))
            assert.equal(result.providerSessionVerified, false)
            if (state === 'owned') {
                assert.equal(result.eligibleAccountCount, 0)
                assert.equal(result.ownedReservationAvailable, true)
                await f.db.$transaction(tx => assertRenewalReadiness(tx, { ...input, lockAssignedAccount: true }))
            }
            if (state === 'available' || state === 'released') await assert.rejects(
                f.db.$transaction(tx => assertRenewalReadiness(tx, { ...input, lockAssignedAccount: true })), /RENEWAL_NOT_READY/)
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 1)
        })
    })
}
