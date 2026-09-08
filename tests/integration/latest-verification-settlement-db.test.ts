import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'

for (const scenario of ['latest-negative', 'stale-attempt', 'stale-baseline', 'retry', 'positive-spend', 'pending-refund'] as const) {
    test(`latest verification settlement: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            const { finalizeRenewalNoChargeFailure } = await import('../../worker/src/lib/renewal-no-charge-finalization')
            await f.db.operation.update({ where: { id: f.operationId }, data: {
                providerMutationStartedAt: f.now, providerMutationStage: 'FINAL_OK', providerPaymentState: 'NOT_CHARGED',
                fulfillmentState: 'VERIFYING', fulfillmentVerificationOutcome: 'CHECK_FAILED',
            } })
            const v = await f.db.operationFulfillmentVerification.create({ data: { operationId: f.operationId,
                state: 'NO_MATCH', attemptCount: 2, lastOutcome: 'VALID_NO_MATCH', nextCheckAt: scenario === 'retry' ? new Date() : null } })
            const baseline = await f.db.operationFulfillmentBaseline.create({ data: {
                verificationId: v.id, operationId: f.operationId, beinAccountId: f.accountId, cardNumberSnapshot: f.cardNumber,
                baselineSequence: 1, sessionGeneration: '1', dealerContextHash: createHash('sha256').update(f.marker).digest('hex'),
                invoiceSet: [], targetCardRows: [], pageCount: 1, rowCount: 0, firstPageWatermark: 'synthetic',
                scanAttemptCount: 1, capturedAt: f.now, supersededAt: scenario === 'stale-baseline' ? f.now : null,
            } })
            await f.db.operationFulfillmentVerification.update({ where: { id: v.id }, data: { activeBaselineId: baseline.id } })
            const old = await f.db.operationFulfillmentVerificationAttempt.create({ data: {
                verificationId: v.id, baselineId: baseline.id, attemptNo: 1, outcome: 'CHECK_FAILED', completeScan: false, reasonCode: 'SYNTHETIC_INCOMPLETE',
            } })
            const latest = await f.db.operationFulfillmentVerificationAttempt.create({ data: {
                verificationId: v.id, baselineId: baseline.id, attemptNo: 2, outcome: 'VALID_NO_MATCH', completeScan: true, reasonCode: 'SYNTHETIC_FINAL_NEGATIVE',
            } })
            if (scenario === 'positive-spend') await f.db.beinAccountSpendLedger.create({ data: f.spendData() })
            if (scenario === 'pending-refund') await f.db.renewalRefundSettlement.create({ data: f.settlementData() })
            const expected = { verificationId: v.id, baselineId: baseline.id,
                attemptId: scenario === 'stale-attempt' ? old.id : latest.id, attemptNo: scenario === 'stale-attempt' ? 1 : 2 }
            const input = { operationId: f.operationId, expected, responseData: {}, responseMessage: 'synthetic', refundReason: 'synthetic' }
            try {
                const results = await Promise.all([finalizeRenewalNoChargeFailure(input, f.db), finalizeRenewalNoChargeFailure(input, f.db)])
                if (scenario === 'latest-negative') {
                    assert.deepEqual(results.map(r => r.status).sort(), ['ALREADY_FAILED_AND_REFUNDED', 'FAILED_AND_REFUNDED'])
                    assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, 174)
                    assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })).fulfillmentVerificationOutcome, 'VALID_NO_MATCH')
                } else assert.ok(results.every(r => r.status === 'EVIDENCE_CONFLICT' || r.status === 'REVIEW_REQUIRED'))
                assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId, type: 'REFUND' } }), scenario === 'latest-negative' ? 1 : 0)
            } finally {
                await f.db.operationFulfillmentVerificationAttempt.deleteMany({ where: { verificationId: v.id } })
            }
        })
    })
}
