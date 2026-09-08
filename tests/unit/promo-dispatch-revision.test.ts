import test from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma } from '@prisma/client'
import { loadDispatch, loadQueue, loadPanelSelection, type RevisionJob } from '../helpers/promo-dispatch-harness'

const job: RevisionJob = { operationId: 'synthetic-op', type: 'APPLY_PROMO', cardNumber: '7100000001', userId: 'synthetic-user' }

function memoryDispatch() {
    const rows: { operationId: string; jobType: string; actionRevision: number; payload: unknown; status: string }[] = []
    const tx = {
        operationDispatch: {
            findUnique: async ({ where }: { where: { operationId_jobType_actionRevision: typeof rows[number] } }) => {
                const key = where.operationId_jobType_actionRevision
                return rows.find(r => r.operationId === key.operationId && r.jobType === key.jobType && r.actionRevision === key.actionRevision) ?? null
            },
            create: async ({ data }: { data: typeof rows[number] }) => {
                rows.push({ ...data, actionRevision: data.actionRevision ?? 0 })
            },
        },
    } as unknown as Prisma.TransactionClient
    return { tx, rows, ...loadDispatch() }
}

test('T015: a second promo revision creates a distinct durable preparation', async () => {
    const h = memoryDispatch()
    await h.createOperationDispatch(h.tx, { ...job, actionRevision: 1, promoCode: 'FIRST' })
    await h.createOperationDispatch(h.tx, { ...job, actionRevision: 2, promoCode: 'SECOND' })
    assert.deepEqual(h.rows.map(r => r.actionRevision), [1, 2])
})

test('T015: identical revision and payload replay the same durable preparation', async () => {
    const h = memoryDispatch()
    const request = { ...job, actionRevision: 1, promoCode: 'FIRST' }
    await h.createOperationDispatch(h.tx, request)
    await h.createOperationDispatch(h.tx, request)
    assert.equal(h.rows.length, 1)
    assert.equal((h.rows[0].payload as RevisionJob).promoCode, 'FIRST')
})

test('T015: changed payload cannot reuse one preparation identity', async () => {
    const h = memoryDispatch()
    await h.createOperationDispatch(h.tx, { ...job, actionRevision: 1, promoCode: 'FIRST' })
    await assert.rejects(h.createOperationDispatch(h.tx, { ...job, actionRevision: 1, promoCode: 'OTHER' }), /PAYLOAD_CONFLICT/)
    assert.equal(h.rows.length, 1)
})

test('legacy omitted and explicit zero revisions replay while changed business values conflict', async () => {
    const h = memoryDispatch()
    await h.createOperationDispatch(h.tx, { ...job, type: 'CONFIRM_PURCHASE' })
    await h.createOperationDispatch(h.tx, { ...job, type: 'CONFIRM_PURCHASE', actionRevision: 0 })
    assert.equal(h.rows.length, 1)
    await assert.rejects(h.createOperationDispatch(h.tx, { ...job, type: 'CONFIRM_PURCHASE', actionRevision: 0, amount: 1 }), /PAYLOAD_CONFLICT/)
})

test('T015: final payment rejects a nonzero preparation revision before writing', async () => {
    const h = memoryDispatch()
    await assert.rejects(h.createOperationDispatch(h.tx, { ...job, type: 'CONFIRM_PURCHASE', actionRevision: 1 }), /ACTION_REVISION/)
    assert.equal(h.rows.length, 0)
})

test('T015: queue identity distinguishes changed offers and preserves identical replay', async () => {
    const h = loadQueue()
    await h.addOperationJob({ ...job, actionRevision: 1, promoCode: 'FIRST' })
    await h.addOperationJob({ ...job, actionRevision: 2, promoCode: 'SECOND' })
    await h.addOperationJob({ ...job, actionRevision: 2, promoCode: 'SECOND' })
    assert.notEqual(h.calls[0].jobId, h.calls[1].jobId)
    assert.equal(h.calls[1].jobId, h.calls[2].jobId)
})

test('T015: legacy final-payment queue identity remains stable', async () => {
    const h = loadQueue()
    await h.addOperationJob({ ...job, type: 'CONFIRM_PURCHASE' })
    await h.addOperationJob({ ...job, type: 'CONFIRM_PURCHASE', actionRevision: 0 })
    assert.equal(h.calls[0].jobId, 'CONFIRM_PURCHASE--synthetic-op')
    assert.equal(h.calls[0].jobId, h.calls[1].jobId)
})

test('T015: durable outbox delivery preserves each preparation revision through the real dispatcher', async () => {
    const queue = loadQueue()
    const rows = [1, 2].map(actionRevision => ({ id: `synthetic-dispatch-${actionRevision}`,
        actionRevision, payload: { ...job, actionRevision, promoCode: `PROMO${actionRevision}` } }))
    const h = loadDispatch({ operationDispatch: {
        findMany: async () => rows,
        updateMany: async () => ({ count: 1 }),
        update: async () => undefined,
    } }, queue.addOperationJob)
    const result = await h.dispatchPendingOperationJobs()
    assert.equal(result.dispatched, 2)
    assert.equal(result.failed, 0)
    assert.deepEqual(queue.calls.map(c => c.data.actionRevision), [1, 2])
    assert.notEqual(queue.calls[0].jobId, queue.calls[1].jobId)
})

for (const scenario of ['current', 'stale', 'refreshing'] as const) {
    test(`T015: panel selection ${scenario} quote is validated before state/dispatch changes`, async () => {
        let writes = 0
        const operation = { id: job.operationId, userId: job.userId, cardNumber: job.cardNumber,
            status: 'AWAITING_PACKAGE', finalConfirmExpiry: null,
            availablePackages: [{ index: 3, name: 'Synthetic package', price: 174 }],
            responseData: { quoteRevision: 2, refreshing: scenario === 'refreshing' } }
        const tx = {
            operation: { findUnique: async () => operation, updateMany: async () => { writes++; return { count: 1 } } },
            user: { findUnique: async () => ({ id: job.userId, balance: 500 }) },
        }
        const h = loadPanelSelection({ $transaction: async (run: (tx: unknown) => unknown) => run(tx) }, job.userId)
        const response = await h.POST(new Request('http://localhost/api/operations/synthetic-op/select-package', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ packageIndex: 3, quoteRevision: scenario === 'stale' ? 1 : 2 }),
        }), { params: Promise.resolve({ id: job.operationId }) })
        assert.equal(response.status, scenario === 'current' ? 200 : 409)
        assert.equal(writes, scenario === 'current' ? 1 : 0)
        assert.equal(h.dispatched(), scenario === 'current' ? 1 : 0)
    })
}
