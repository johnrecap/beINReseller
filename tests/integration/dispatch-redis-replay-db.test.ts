import test from 'node:test'
import assert from 'node:assert/strict'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import crypto from 'node:crypto'
import { auditDatabaseSkipReason, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { loadDispatch, loadIsolatedModule, type RevisionJob } from '../helpers/promo-dispatch-harness'
import * as packageQuote from '../../shared/operations/package-quote'

test('T034 an expired maintenance leader cannot delete its successor Redis lease', {
    skip: process.env.RUN_REDIS_INTEGRATION !== '1' && 'REDIS_INTEGRATION_REQUIRED',
}, async () => {
    const url = new URL(process.env.TEST_REDIS_URL!)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const client = new Redis(url.href, { maxRetriesPerRequest: 0 })
    const key = `audit036-maintenance-${crypto.randomUUID()}`
    const loaded = loadIsolatedModule<{ releaseLeaderLock: (token: string) => Promise<void> }>(
        'src/lib/maintenance/operation-maintenance-runner.ts', {
            'node:crypto': { default: crypto }, '@/lib/prisma': {},
            '@/lib/redis': { default: { eval: (script: string, count: number, originalKey: string, token: string) => {
                assert.equal(originalKey, 'operation-maintenance:leader')
                return client.eval(script, count, key, token)
            } } },
            '@/lib/operations/recovery': {}, '@/lib/operation-dispatch': {},
            '@/lib/maintenance/operation-spend-award-run-maintenance': {},
            '@/lib/maintenance/renewal-fulfillment-verification-maintenance': {},
            '@/lib/maintenance/completion-effect-maintenance': {},
        }, ['releaseLeaderLock'])
    try {
        await client.set(key, 'successor', 'PX', 60000)
        await loaded.releaseLeaderLock('expired-predecessor')
        assert.equal(await client.get(key), 'successor')
        await loaded.releaseLeaderLock('successor')
        assert.equal(await client.get(key), null)
    } finally {
        await client.del(key)
        await client.quit()
    }
})

test('T030 real BullMQ retains one durable job after acknowledgement loss and concurrent outbox retries', {
    skip: auditDatabaseSkipReason || (process.env.RUN_REDIS_INTEGRATION !== '1' && 'REDIS_INTEGRATION_REQUIRED'),
}, async () => {
    const url = new URL(process.env.TEST_REDIS_URL!)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'isolated loopback Redis required')
    await withAuditOperationFixture('reseller', async f => {
        const queues: Queue[] = []
        class IsolatedQueue extends Queue {
            constructor(name: string, options: ConstructorParameters<typeof Queue>[1]) {
                super(`${f.marker}-${name}`, options)
                queues.push(this)
            }
        }
        const actual = loadIsolatedModule<{ addOperationJob: (data: RevisionJob) => Promise<unknown> }>('src/lib/queue.ts', {
            bullmq: { Queue: IsolatedQueue }, '../../shared/operations/package-quote': packageQuote,
        }, [], { REDIS_URL: url.href })
        try {
            let lost = true
            const dispatch = loadDispatch(f.db, async data => {
                await actual.addOperationJob(data)
                if (lost) throw new Error('SYNTHETIC_ACK_LOST_AFTER_REDIS_ACCEPTED')
            })
            await dispatch.createOperationDispatch(f.db, { operationId: f.operationId, userId: f.userId,
                cardNumber: f.cardNumber, type: 'CONFIRM_PURCHASE' })
            const scope = { operationIds: [f.operationId] }
            assert.equal((await dispatch.dispatchPendingOperationJobs(scope)).failed, 1)
            lost = false
            await f.db.operationDispatch.updateMany({ where: { operationId: f.operationId }, data: { nextAttemptAt: new Date(0) } })
            await Promise.all([dispatch.dispatchPendingOperationJobs(scope), dispatch.dispatchPendingOperationJobs(scope)])
            const jobs = await queues[0].getJobs(['wait', 'prioritized', 'active', 'completed', 'failed'])
            assert.equal(jobs.length, 1)
            assert.equal(jobs[0].id, `CONFIRM_PURCHASE--${f.operationId}`)
            assert.equal((await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })).status, 'DISPATCHED')
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 1)
        } finally {
            for (const queue of queues) {
                await queue.obliterate({ force: true }) // unique fixture queue only; never shared queues
                await queue.close()
            }
        }
    })
})
