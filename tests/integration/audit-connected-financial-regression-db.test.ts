import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { inspectPanelReviewCompatibility } from '../../src/lib/financial-review/preflight'
import { classifyFinancialReview, reviewCapabilitySelect } from '../../src/lib/financial-review/capabilities'

test('T039 bounded compatibility scan reports legacy evidence holds without changing historical money or completion', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETED', purpose: null } })
        const before = await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })
        const report = await inspectPanelReviewCompatibility(f.db, { operationIds: [f.operationId], batchSize: 1, maxPages: 1 })
        assert.equal(report.inspected, 1)
        assert.equal(report.complete, false)
        assert.equal(report.categories.HISTORICAL_COMPLETION_EVIDENCE_HOLD, 1)
        assert.equal((await inspectPanelReviewCompatibility(f.db, { operationIds: [f.operationId], cursor: report.nextCursor! })).inspected, 0)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, before.balance)
        assert.equal(await f.db.operationCompletionEffect.count({ where: { operationId: f.operationId } }), 0)
        assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 1)
        assert.equal(JSON.stringify(report).includes(f.cardNumber), false)
    })
})

for (const changed of ['none', 'demotion', 'dispatch', 'refund'] as const) test(`T026 pre-mutation review revalidates ${changed} and preserves balanced settlement`, { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const { finalizeWebPreMutationRenewalTermination } = await import('../../src/lib/operations/pre-mutation-renewal-finalization')
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'REVIEW_REQUIRED', providerPaymentState: 'NOT_SUBMITTED',
            providerMutationStartedAt: null, providerMutationStage: null, responseData: { operationPhase: 'PACKAGE_PREPARATION', finalPaySubmitted: false } } })
        const loaded = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId }, select: reviewCapabilitySelect })
        assert.ok(classifyFinancialReview(loaded).allowedActions.includes('RESOLVE_PRE_MUTATION'))
        if (changed === 'demotion') await f.db.user.update({ where: { id: f.userId }, data: { role: 'USER' } })
        if (changed === 'refund') await f.db.renewalRefundSettlement.create({ data: f.settlementData() })
        if (changed === 'dispatch') await f.db.operationDispatch.create({ data: { operationId: f.operationId, jobType: 'CONFIRM_PURCHASE',
            payload: {}, status: 'DISPATCHING', attempts: 1 } })
        const before = (await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance
        const input = { operationId: f.operationId, terminalStatus: 'FAILED' as const, allowedStatuses: ['REVIEW_REQUIRED' as const],
            responseMessage: 'SYNTHETIC_REVIEW_RESOLVED', releaseReason: 'SYNTHETIC_REVIEW',
            adminReview: { actorId: f.userId, actorUsername: f.marker, note: 'Audited pre-submission fixture' } }
        const result = await finalizeWebPreMutationRenewalTermination(input)
        assert.equal(result.status, changed === 'none' ? 'TERMINATED' : 'EVIDENCE_CONFLICT')
        if (changed === 'none') assert.equal((await finalizeWebPreMutationRenewalTermination(input)).status, 'ALREADY_TERMINATED')
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, before + (changed === 'none' ? 174 : 0))
        assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId, type: 'REFUND' } }), changed === 'none' ? 1 : 0)
    })
})
