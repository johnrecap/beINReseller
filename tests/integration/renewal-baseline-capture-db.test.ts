import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import type { HttpClientService } from '../../worker/src/http/HttpClientService'

test('baseline capture uses the real operation schema, reuses its context and rejects a completed operation',
    { skip: auditDatabaseSkipReason }, async () => {
    const { captureRenewalFulfillmentBaseline } = await import('../../worker/src/lib/fulfillment-baseline')
    const { prisma } = await import('../../worker/src/lib/prisma')
    try {
        await withAuditOperationFixture('reseller', async f => {
            await f.db.cardLifecycleReservation.create({ data: { operationId: f.operationId, cardNumber: f.cardNumber } })
            await f.db.providerAccountCausalReservation.create({ data: {
                operationId: f.operationId, beinAccountId: f.accountId, reservationGeneration: 1,
                automaticWindowEndsAt: new Date(Date.now() + 300_000),
            } })
            let scans = 0
            const input = {
                operationId: f.operationId, beinAccountId: f.accountId, cardNumber: f.cardNumber,
                reservationGeneration: 1, sessionGeneration: 'synthetic-baseline-session',
                client: { scanSoldPackagesReport: async () => {
                    scans++
                    return { outcome: 'COMPLETE', dealerContextHash: 'a'.repeat(64), rows: [],
                        firstPageWatermark: 'b'.repeat(64), pageCount: 1, pageCap: 100, scanAttemptCount: 1 }
                } } as unknown as HttpClientService,
                assertExecutionCurrent: async () => {},
            }
            const first = await captureRenewalFulfillmentBaseline(input)
            assert.equal(first.complete, true)
            assert.ok(first.baselineId)
            const reused = await captureRenewalFulfillmentBaseline(input)
            assert.equal(reused.baselineId, first.baselineId)
            assert.equal(scans, 1)
            await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETED' } })
            await assert.rejects(captureRenewalFulfillmentBaseline(input), /FULFILLMENT_BASELINE_CONTEXT_STALE/)
        })
    } finally { await prisma.$disconnect() }
})
