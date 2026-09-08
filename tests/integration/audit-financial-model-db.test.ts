import test from 'node:test'
import assert from 'node:assert/strict'
import {
    auditDatabaseSkipReason, withAuditOperationFixture, auditFixtureCases,
} from '../helpers/audit-operation-fixtures'
import { isRefundSettlementVeto } from '../../shared/operations/audit-financial-context'

// T003 authored before the new schema. Q04 requires a confirmed disposable database.
// These assert database behavior, not source-string matches.
test('T003 DB: spend XOR owner and operation uniqueness preserve both owner families',
    { skip: auditDatabaseSkipReason }, async () => {
    for (const kind of ['reseller', 'customer'] as const) await withAuditOperationFixture(kind, async (f) => {
        const data = f.spendData()
        for (const owner of [{ userId: null, customerId: null }, { userId: f.userId, customerId: f.customerId }]) {
            await assert.rejects(f.db.beinAccountSpendLedger.create({ data: { ...data, ...owner } }))
        }
        const row = await f.db.beinAccountSpendLedger.create({ data })
        assert.equal(row.userId, kind === 'reseller' ? f.userId : null)
        assert.equal(row.customerId, kind === 'customer' ? f.customerId : null)
        await assert.rejects(f.db.beinAccountSpendLedger.create({ data }))
    })
})

test('T003 DB: preparation revisions are unique and financial mutation remains revision zero',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('customer', async (f) => {
        const data = { operationId: f.operationId, jobType: 'APPLY_PROMO', payload: {} }
        await f.db.operationDispatch.create({ data })
        await f.db.operationDispatch.create({ data: { ...data, actionRevision: 1 } })
        await assert.rejects(f.db.operationDispatch.create({ data: { ...data, actionRevision: 1 } }))
        await assert.rejects(f.db.operationDispatch.create({ data: { ...data, actionRevision: -1 } }))
        await assert.rejects(f.db.operationDispatch.create({ data: { ...data, jobType: 'CONFIRM_INSTALLMENT', actionRevision: 1 } }))
        assert.ok(await f.db.operationDispatch.findUnique({
            where: { operationId_jobType_actionRevision: { operationId: f.operationId, jobType: 'APPLY_PROMO', actionRevision: 0 } },
        }))
    })
})

test('T003 DB: fixed claim remains unchanged by unrelated subscription activity',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('mixed', async (f) => {
        const claimedAt = new Date('2026-09-07T00:00:00Z')
        const expiresAt = new Date('2026-09-07T00:02:00Z')
        await f.db.storeSubscription.update({ where: { id: f.subscriptionId },
            data: { paymentClaimedAt: claimedAt, paymentClaimExpiresAt: expiresAt, paymentClaimKey: f.marker } })
        await f.db.storeSubscription.update({ where: { id: f.subscriptionId }, data: { resultMessage: 'synthetic activity' } })
        const row = await f.db.storeSubscription.findUniqueOrThrow({ where: { id: f.subscriptionId } })
        assert.deepEqual(row.paymentClaimedAt, claimedAt)
        assert.deepEqual(row.paymentClaimExpiresAt, expiresAt)
        await assert.rejects(f.db.storeSubscription.update({ where: { id: f.subscriptionId },
            data: { paymentClaimExpiresAt: new Date('2026-09-07T00:03:00Z') } }))
    })
})

test('T003 DB: canonical refund/request/event identities and original funding bounds',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('mixed', async (f) => {
        const data = f.settlementData()
        const settlement = await f.db.renewalRefundSettlement.create({ data })
        await assert.rejects(f.db.renewalRefundSettlement.create({ data: { ...data, commandKey: f.marker + '-different' } }))
        await assert.rejects(f.db.renewalRefundSettlement.update({ where: { id: settlement.id },
            data: { requestedExternalMinor: data.originalExternalMinor + 1 } }))
        await assert.rejects(f.db.renewalRefundSettlement.update({ where: { id: settlement.id },
            data: { state: 'CANCELLED', cancellationEvidenceReference: 'synthetic-no-effect', reservedStoreCreditMinor: 1 } }))
        const requestData = { settlementId: settlement.id, sequence: 0, amountMinor: 100,
            providerIdempotencyKey: f.marker + '-refund', payloadFingerprint: 'synthetic-fingerprint' }
        const request = await f.db.renewalRefundRequest.create({ data: requestData })
        await assert.rejects(f.db.renewalRefundRequest.create({ data: requestData }))
        await assert.rejects(f.db.renewalRefundRequest.update({ where: { id: request.id }, data: { amountMinor: 101 } }))
        await assert.rejects(f.db.renewalRefundSettlement.update({ where: { id: settlement.id },
            data: { originalExternalMinor: data.originalExternalMinor + 100 } }))
        const event = { requestId: request.id, paymentId: f.paymentId, providerEventId: f.marker + '-event',
            providerRefundId: f.marker + '-refund-id', amountMinor: 100, currency: 'SAR',
            status: 'SUCCEEDED', observedAt: new Date('2026-09-07T00:01:00Z') }
        await f.db.renewalRefundObservation.create({ data: event })
        await assert.rejects(f.db.renewalRefundObservation.create({ data: event }))
        await assert.rejects(f.db.renewalRefundObservation.update({ where: { providerEventId: event.providerEventId },
            data: { amountMinor: 101 } }))
        assert.equal(isRefundSettlementVeto(settlement), true)
    })
})

test('T003 DB: completion effects are unique under concurrent insertion',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('reseller', async (f) => {
        const data = { operationId: f.operationId, effectKind: 'ACTIVITY_COUNTER',
            completionSnapshot: { owner: f.userId, provenance: 'SYNTHETIC' }, snapshotVersion: 1 }
        const results = await Promise.allSettled([0, 1].map(() => f.db.operationCompletionEffect.create({ data })))
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
        assert.equal(await f.db.operationCompletionEffect.count({ where: { operationId: f.operationId } }), 1)
        await assert.rejects(f.db.operationCompletionEffect.updateMany({ where: { operationId: f.operationId },
            data: { completionSnapshot: { owner: 'different-owner' } } }))
    })
})

test('T003 DB: cancellation cannot release a veto with wallet money still reserved',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('wallet', async (f) => {
        const settlement = await f.db.renewalRefundSettlement.create({ data: f.settlementData() })
        await assert.rejects(f.db.renewalRefundSettlement.update({ where: { id: settlement.id },
            data: { state: 'CANCELLED', cancellationEvidenceReference: 'synthetic-no-effect', reservedWalletMinor: 1 } }))
    })
})

test('T004 DB: installment identity, settlement reference and observation bounds are enforced',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('installment', async (f) => {
        const row = await f.db.operationInstallmentEvidence.findUniqueOrThrow({ where: { operationId: f.operationId } })
        assert.equal(row.settlementState, 'UNKNOWN')
        await assert.rejects(f.db.operationInstallmentEvidence.create({ data: { ...row, id: row.id + '-duplicate' } }))
        for (const data of [
            { settlementState: 'SETTLED', settlementReference: null },
            { settlementState: 'SETTLED', settlementReference: ' ' },
            { observedAt: new Date(f.now.getTime() - 1) },
            { paymentState: 'INVALID' }, { evidenceVersion: 0 },
            { amount: -1, currency: 'SAR' }, { amount: 1, currency: null },
        ]) await assert.rejects(f.db.operationInstallmentEvidence.update({ where: { id: row.id }, data }))
        const settled = await f.db.operationInstallmentEvidence.update({ where: { id: row.id },
            data: { paymentState: 'CHARGED', settlementState: 'SETTLED', settlementReference: 'synthetic-receipt' } })
        assert.equal(settled.settlementState, 'SETTLED')
    })
})

test('T004 DB: legacy adjudication identity and evidence cannot be rewritten',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('legacy', async (f) => {
        const data = { operationId: f.operationId, actorId: f.userId, decisionKey: f.marker,
            payloadFingerprint: 'synthetic-payload', decisionKind: 'HOLD', classification: 'LEGACY_EVIDENCE_HOLD',
            normalizedEvidence: { provenance: 'SYNTHETIC_AUDIT_036' }, sourceReference: 'synthetic-source',
            observedAt: f.now, reasonCode: 'SYNTHETIC_HOLD', decisionNote: 'Synthetic evidence only' }
        const row = await f.db.operationReviewAdjudication.create({ data })
        await assert.rejects(f.db.operationReviewAdjudication.create({ data }))
        await assert.rejects(f.db.operationReviewAdjudication.update({ where: { id: row.id },
            data: { normalizedEvidence: { altered: true } } }))
        await assert.rejects(f.db.operationReviewAdjudication.create({ data: {
            ...data, decisionKey: f.marker + '-invalid', classification: 'INVALID',
        } }))
    })
})

test('T005 DB: callback failure still cleans only its own synthetic fixture',
    { skip: auditDatabaseSkipReason }, async () => {
    await withAuditOperationFixture('reseller', async (retained) => {
        let removedUserId = '', removedOperationId = ''
        await assert.rejects(withAuditOperationFixture('mixed', async (removed) => {
            removedUserId = removed.userId
            removedOperationId = removed.operationId
            throw new Error('SYNTHETIC_CALLBACK_FAILURE')
        }), /SYNTHETIC_CALLBACK_FAILURE/)
        assert.equal(await retained.db.user.count({ where: { id: removedUserId } }), 0)
        assert.equal(await retained.db.operation.count({ where: { id: removedOperationId } }), 0)
        assert.equal(await retained.db.operation.count({ where: { id: retained.operationId } }), 1)
    })
})

test('T005 DB: synthetic legacy/modern fixtures retain explicit provenance and evidence gaps',
    { skip: auditDatabaseSkipReason }, async () => {
    for (const kind of auditFixtureCases) await withAuditOperationFixture(kind, async (f) => {
        const op = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
        assert.equal((op.responseData as { provenance: string }).provenance, 'SYNTHETIC_AUDIT_036')
        if (kind === 'legacy') {
            assert.equal(op.purpose, null)
            assert.equal(op.providerMutationStartedAt, null)
            assert.equal(op.providerPaymentState, null)
        }
        if (kind === 'active-refund') assert.equal(await f.db.renewalRefundSettlement.count({
            where: { operationId: f.operationId, state: 'UNKNOWN' },
        }), 1)
        if (kind === 'old-dispatch') assert.equal((await f.db.operationDispatch.findFirstOrThrow({
            where: { operationId: f.operationId },
        })).actionRevision, 0)
        if (kind === 'stale-baseline') {
            const baselines = await f.db.operationFulfillmentBaseline.findMany({
                where: { operationId: f.operationId }, orderBy: { baselineSequence: 'asc' },
            })
            assert.equal(baselines.length, 2)
            assert.ok(baselines[0].supersededAt)
            assert.equal(baselines[1].supersededAt, null)
        }
        if (kind === 'wallet') assert.equal(await f.db.walletTransaction.count({
            where: { referenceId: f.operationId, type: 'DEBIT' },
        }), 1)
    })
})

// Calls the existing webhook finalizer against a canonical-order test transaction.
// It is serialization scaffolding; T021 must add the active-settlement veto end-to-end.
test('T003 DB: existing Stripe refund finalizer serializes with canonical financial locks',
    { skip: auditDatabaseSkipReason, timeout: 20000 }, async () => {
    await withAuditOperationFixture('mixed', async (f) => {
        const { finalizeRenewalPaymentRefund } = await import('../../src/lib/renewal-payment-refund-finalization')
        const { lockRenewalCardLifecycle } = await import('../../src/lib/operations/renewal-creation-guard')
        let release!: () => void, markHeld!: () => void, markWaiter!: () => void
        const releaseGate = new Promise<void>(resolve => { release = resolve })
        const heldGate = new Promise<void>(resolve => { markHeld = resolve })
        const waiterGate = new Promise<void>(resolve => { markWaiter = resolve })
        let waiterPid = 0
        const holder = f.db.$transaction(async tx => {
                await lockRenewalCardLifecycle(tx, f.cardNumber)
                await tx.$queryRaw`SELECT id FROM operations WHERE id = ${f.operationId} FOR UPDATE`
                await tx.$queryRaw`SELECT id FROM store_subscriptions WHERE id = ${f.subscriptionId} FOR UPDATE`
                await tx.$queryRaw`SELECT id FROM payments WHERE id = ${f.paymentId} FOR UPDATE`
                await tx.$queryRaw`SELECT id FROM customers WHERE id = ${f.customerId} FOR UPDATE`
                await tx.$queryRaw`SELECT id FROM card_lifecycle_reservations WHERE operation_id = ${f.operationId} FOR UPDATE`
                markHeld()
                await releaseGate
                return 'LOCKED'
        }, { timeout: 10000 })
        await Promise.race([heldGate, holder])
        const waiter = f.db.$transaction(async tx => {
            const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
            waiterPid = rows[0].pid
            markWaiter()
            return finalizeRenewalPaymentRefund(tx, f.refundInput())
        }, { timeout: 10000 })
        // Attach handlers immediately, and always release before fixture cleanup.
        const joined = Promise.allSettled([holder, waiter])
        try {
            await Promise.race([waiterGate, waiter])
            let blocked = false
            for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
                const rows = await f.db.$queryRaw<Array<{ blocked: boolean }>>`
                    SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = ${waiterPid}
                        AND locktype = 'advisory' AND NOT granted) AS blocked`
                blocked = rows[0].blocked
                if (!blocked) await new Promise(resolve => setTimeout(resolve, 20))
            }
            assert.equal(blocked, true, 'The actual finalizer must wait on the held card lock')
        } finally {
            release()
            await joined
        }
        assert.equal(await holder, 'LOCKED')
        assert.equal((await waiter as { result: string }).result, 'REFUNDED')
        assert.equal(await f.db.storeCreditLedgerEntry.count({ where: { subscriptionId: f.subscriptionId, entryType: 'REFUND' } }), 1)
    })
})
