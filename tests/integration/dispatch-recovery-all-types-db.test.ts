import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { loadDispatch } from '../helpers/promo-dispatch-harness'

const types = ['START_RENEWAL', 'COMPLETE_PURCHASE', 'APPLY_PROMO', 'CONFIRM_PURCHASE', 'CANCEL_CONFIRM',
    'SIGNAL_REFRESH', 'SIGNAL_CHECK', 'SIGNAL_ACTIVATE', 'START_INSTALLMENT', 'CONFIRM_INSTALLMENT']

test('T031 a late delivery-error writer cannot erase a persisted Pay submission', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETING',
            providerMutationStage: 'FINAL_OK', providerMutationStartedAt: new Date(),
            responseData: { finalPaySubmitted: true, operationPhase: 'FINAL_PAY', marker: 'keep' } } })
        const h = loadDispatch(f.db)
        assert.equal(await h.recordOperationDispatchEvidence(f.operationId, { phase: 'DISPATCH_FAILED', message: 'Delivery uncertain' }), false)
        const row = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
        assert.equal((row.responseData as { finalPaySubmitted: boolean }).finalPaySubmitted, true)
        assert.equal((row.responseData as { operationPhase: string }).operationPhase, 'FINAL_PAY')
    })
})

for (const type of types) {
    test(`T030 ${type}: uncertain delivery, concurrent retry, reviewed-operation veto`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            let outage = true
            const delivered = new Set<string>()
            let submissions = 0
            const h = loadDispatch(f.db, async data => {
                const identity = `${data.type}--${data.operationId}--${data.actionRevision || 0}`
                if (!delivered.has(identity)) { delivered.add(identity); submissions++ }
                if (outage) throw new Error('SYNTHETIC_ACK_LOST')
            })
            await h.createOperationDispatch(f.db, { operationId: f.operationId, userId: f.userId,
                cardNumber: f.cardNumber, type, actionRevision: type === 'APPLY_PROMO' ? 1 : 0 })
            const options = { operationIds: [f.operationId] }
            assert.equal((await h.dispatchPendingOperationJobs(options)).failed, 1)
            const first = await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })
            assert.equal(first.status, 'PENDING')
            outage = false
            // Simulate elapsed backoff without sleeping or changing the clock.
            await f.db.operationDispatch.update({ where: { id: first.id }, data: { nextAttemptAt: new Date(0) } })
            await Promise.all([h.dispatchPendingOperationJobs(options), h.dispatchPendingOperationJobs(options)])
            assert.equal(submissions, 1, 'retry retains the queue identity after uncertain acknowledgement')
            const final = await f.db.operationDispatch.findUniqueOrThrow({ where: { id: first.id } })
            assert.equal(final.status, 'DISPATCHED')
            assert.equal(final.attempts, 2)
            await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'REVIEW_REQUIRED' } })
            await f.db.operationDispatch.update({ where: { id: first.id }, data: { status: 'PENDING', updatedAt: new Date(0) } })
            assert.equal((await h.dispatchPendingOperationJobs(options)).scanned, 0)
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 1)
        })
    })
}

for (const outcome of ['ack', 'failure', 'duplicate'] as const) {
    for (const concurrentState of ['CANCELLED', 'REVIEW_REQUIRED', 'new-claim'] as const) {
        test(`T030 stale ${outcome} cannot overwrite ${concurrentState}`, { skip }, async () => {
            await withAuditOperationFixture('reseller', async f => {
                let sendStarted!: () => void
                const started = new Promise<void>(resolve => { sendStarted = resolve })
                let finish!: () => void
                const pending = new Promise<void>(resolve => { finish = resolve })
                const h = loadDispatch(f.db, async () => {
                    sendStarted()
                    await pending
                    if (outcome !== 'ack') throw new Error(outcome === 'duplicate' ? 'Job already exists' : 'SYNTHETIC_ACK_LOST')
                })
                await h.createOperationDispatch(f.db, { operationId: f.operationId, userId: f.userId,
                    cardNumber: f.cardNumber, type: 'START_RENEWAL' })
                const sending = h.dispatchPendingOperationJobs({ operationIds: [f.operationId] })
                await started
                const row = await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })
                await f.db.operationDispatch.update({ where: { id: row.id }, data: concurrentState === 'new-claim'
                    ? { attempts: { increment: 1 }, lastError: 'NEW_CLAIM_MARKER' }
                    : { status: concurrentState, lastError: 'NEW_STATE_MARKER' } })
                finish()
                await sending
                const after = await f.db.operationDispatch.findUniqueOrThrow({ where: { id: row.id } })
                assert.equal(after.status, concurrentState === 'new-claim' ? 'DISPATCHING' : concurrentState)
                assert.equal(after.lastError, concurrentState === 'new-claim' ? 'NEW_CLAIM_MARKER' : 'NEW_STATE_MARKER')
            })
        })
    }
}

test('T030 invalid jobId error is not delivery proof', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const h = loadDispatch(f.db, async () => { throw new Error('Invalid jobId') })
        await h.createOperationDispatch(f.db, { operationId: f.operationId, userId: f.userId,
            cardNumber: f.cardNumber, type: 'START_RENEWAL' })
        assert.equal((await h.dispatchPendingOperationJobs({ operationIds: [f.operationId] })).failed, 1)
        assert.equal((await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })).status, 'PENDING')
    })
})

for (const type of types.filter(type => type !== 'CONFIRM_PURCHASE')) {
    test(`T030 ${type}: stale claim and five-attempt exhaustion stop delivery without refund`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            await f.db.operation.update({ where: { id: f.operationId }, data: {
                status: type === 'APPLY_PROMO' ? 'AWAITING_PACKAGE'
                    : ['COMPLETE_PURCHASE', 'CONFIRM_INSTALLMENT', 'CANCEL_CONFIRM'].includes(type) ? 'COMPLETING' : 'PENDING',
                responseData: { quoteRevision: 1, quoteState: 'PENDING', refreshing: true },
            } })
            let sends = 0
            const h = loadDispatch(f.db, async () => { sends++; throw new Error('SYNTHETIC_OUTAGE') })
            await h.createOperationDispatch(f.db, { operationId: f.operationId, userId: f.userId,
                cardNumber: f.cardNumber, type, actionRevision: type === 'APPLY_PROMO' ? 1 : 0 })
            const row = await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })
            await f.db.operationDispatch.update({ where: { id: row.id }, data: {
                status: 'DISPATCHING', attempts: 4, updatedAt: new Date(0),
            } })
            await h.runDispatchWatchdog()
            let current = await f.db.operationDispatch.findUniqueOrThrow({ where: { id: row.id } })
            assert.equal(current.status, 'PENDING')
            assert.equal(sends, 0, 'stale claims respect retry delay')
            assert.ok(current.nextAttemptAt.getTime() > Date.now() + 590000)
            await f.db.operationDispatch.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } })
            await Promise.all([h.runDispatchWatchdog(), h.runDispatchWatchdog()])
            current = await f.db.operationDispatch.findUniqueOrThrow({ where: { id: row.id } })
            assert.equal(current.attempts, 5)
            assert.equal(current.status, 'REVIEW_REQUIRED')
            assert.equal(sends, 1)
            const operation = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
            assert.equal(operation.status, type === 'APPLY_PROMO' ? 'AWAITING_PACKAGE' : 'REVIEW_REQUIRED')
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId, type: 'REFUND' } }), 0)
        })
    })
}

test('T030 delivery backoff is persisted, bounded and not bypassed by another scheduler', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        let sends = 0
        const h = loadDispatch(f.db, async () => { sends++; throw new Error('private payload must not be stored') })
        await h.createOperationDispatch(f.db, { operationId: f.operationId, userId: f.userId,
            cardNumber: f.cardNumber, type: 'START_RENEWAL' })
        for (const [index, delay] of [5000, 30000, 120000, 600000].entries()) {
            const before = Date.now()
            await h.dispatchPendingOperationJobs({ operationIds: [f.operationId] })
            const row = await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })
            assert.equal(row.attempts, index + 1)
            assert.ok(row.nextAttemptAt.getTime() >= before + delay)
            assert.ok(row.nextAttemptAt.getTime() <= Date.now() + delay)
            assert.equal(row.lastError, 'OPERATION_QUEUE_DELIVERY_FAILED')
            assert.equal((await h.dispatchPendingOperationJobs({ operationIds: [f.operationId] })).scanned, 0)
            await f.db.operationDispatch.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } })
        }
        assert.equal(sends, 4)
    })
})
