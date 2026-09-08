import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { loadReviewFinalizers } from '../helpers/financial-review-harness'
import { captureCompletionEffects, deliverCompletionEffects } from '../../shared/operations/completion-effects'

test('T032 interruption after counter writes rolls back with its delivery marker', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const completedAt = new Date()
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETED', completedAt,
            fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION' } })
        await f.db.$transaction(tx => captureCompletionEffects(tx, f.operationId, completedAt))
        const failingDb = {
            operationCompletionEffect: f.db.operationCompletionEffect,
            $transaction: ((callback: (tx: unknown) => Promise<unknown>) => f.db.$transaction(tx => callback(new Proxy(tx, {
                get(target, key) {
                    if (key === 'activityLog') return { ...target.activityLog, create: async () => { throw new Error('SYNTHETIC_PROCESS_INTERRUPTION') } }
                    return Reflect.get(target, key)
                },
            })))) as typeof f.db.$transaction,
        }
        const result = await deliverCompletionEffects(failingDb, { operationId: f.operationId })
        assert.equal(result.retryScheduled, 1)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).totalOperations, 0)
        assert.equal((await f.db.beinAccount.findUniqueOrThrow({ where: { id: f.accountId } })).usageCount, 0)
        await f.db.operationCompletionEffect.updateMany({ where: { operationId: f.operationId, state: 'PENDING' }, data: { nextAttemptAt: new Date(0) } })
        await deliverCompletionEffects(f.db, { operationId: f.operationId })
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).totalOperations, 1)
        assert.equal((await f.db.beinAccount.findUniqueOrThrow({ where: { id: f.accountId } })).usageCount, 1)
        assert.equal(await f.db.activityLog.count({ where: { userId: f.userId } }), 1)
    })
})

test('T032 manual completion survives worker exit; concurrent maintenance applies immutable effects once', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const now = new Date()
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'REVIEW_REQUIRED',
            providerMutationStartedAt: now, providerMutationStage: 'FINAL_OK', providerPaymentState: 'UNKNOWN',
            selectedPackage: { name: 'Synthetic package', price: 174 } } })
        const h = loadReviewFinalizers(f.db)
        const result = await h.finalizeManualRenewalFulfillment({ operationId: f.operationId, providerPaymentState: 'UNKNOWN',
            decisionNote: 'Synthetic confirmation', actorUsername: f.marker, evidence: {
                beinAccountId: f.accountId, invoiceNo: f.marker + '-invoice', cardNumberSnapshot: f.cardNumber,
                packageNameSnapshot: 'Synthetic package', providerAmount: '174', currency: 'USD',
                evidenceSource: 'SYNTHETIC_RECEIPT', evidenceNote: 'Fixture only', observedAt: now, actorUserId: f.userId,
            } })
        assert.equal(result.status, 'COMPLETED')
        assert.equal(await f.db.operationCompletionEffect.count({ where: { operationId: f.operationId } }), 3)
        assert.equal(await f.db.notification.count({ where: { userId: f.userId } }), 0)
        // Simulate termination immediately after the completion commit: only
        // maintenance resumes; no provider handler, Pay or historical backfill.
        await Promise.all([deliverCompletionEffects(f.db, { operationId: f.operationId }), deliverCompletionEffects(f.db, { operationId: f.operationId })])
        await deliverCompletionEffects(f.db, { operationId: f.operationId })
        assert.equal(await f.db.notification.count({ where: { userId: f.userId } }), 1)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).totalOperations, 1)
        assert.equal((await f.db.beinAccount.findUniqueOrThrow({ where: { id: f.accountId } })).totalSuccess, 1)
        assert.equal(await f.db.activityLog.count({ where: { userId: f.userId, action: 'OPERATION_COMPLETE' } }), 1)
        assert.equal(await f.db.operationCompletionEffect.count({ where: { operationId: f.operationId, state: 'DELIVERED' } }), 3)
        const op = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
        await f.db.$transaction(tx => captureCompletionEffects(tx, f.operationId, op.completedAt!))
        assert.equal(await f.db.operationCompletionEffect.count({ where: { operationId: f.operationId } }), 3)
        await f.db.operation.update({ where: { id: f.operationId }, data: { amount: 175 } })
        await assert.rejects(f.db.$transaction(tx => captureCompletionEffects(tx, f.operationId, op.completedAt!)), /SNAPSHOT_CONFLICT/)
    })
})

test('T032 failed local effect rolls back notification/counter and exhausts without exposing exception text', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const completedAt = new Date()
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETED', completedAt,
            fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION' } })
        await f.db.$transaction(tx => captureCompletionEffects(tx, f.operationId, completedAt))
        // Corrupt context, not the immutable captured snapshot, after capture.
        await f.db.operation.update({ where: { id: f.operationId }, data: { fulfillmentAuthority: 'NONE' } })
        for (let attempt = 0; attempt < 5; attempt++) {
            await f.db.operationCompletionEffect.updateMany({ where: { operationId: f.operationId }, data: { nextAttemptAt: new Date(0) } })
            await deliverCompletionEffects(f.db, { operationId: f.operationId })
        }
        assert.equal(await f.db.notification.count({ where: { userId: f.userId } }), 0)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).totalOperations, 0)
        const rows = await f.db.operationCompletionEffect.findMany({ where: { operationId: f.operationId } })
        assert.ok(rows.every(row => row.state === 'EXHAUSTED' && row.attempts === 5 && row.lastError === 'COMPLETION_EFFECT_DELIVERY_FAILED'))
        const result = await deliverCompletionEffects(f.db, { operationId: f.operationId })
        assert.equal(result.inspected, 0)
        assert.equal(result.exhaustedCount, rows.length)
    })
})

test('T032 stale effect claim replays once without recreating effects for old completed rows', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const completedAt = new Date()
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETED', completedAt,
            fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION' } })
        assert.equal((await deliverCompletionEffects(f.db, { operationId: f.operationId })).inspected, 0, 'maintenance never invents historical completion effects')
        await f.db.$transaction(tx => captureCompletionEffects(tx, f.operationId, completedAt))
        await f.db.operationCompletionEffect.updateMany({ where: { operationId: f.operationId }, data: {
            state: 'DELIVERING', attempts: 1, leaseOwner: 'dead-worker', leaseExpiresAt: new Date(0), nextAttemptAt: new Date(0),
        } })
        await deliverCompletionEffects(f.db, { operationId: f.operationId })
        assert.equal(await f.db.notification.count({ where: { userId: f.userId } }), 1)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).totalOperations, 1)
    })
})
