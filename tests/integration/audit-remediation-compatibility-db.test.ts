import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { inspectPanelReviewCompatibility } from '../../src/lib/financial-review/preflight'

for (const variant of ['legacy', 'empty-package', 'negative-amount', 'absent-deduction', 'alias', 'installment'] as const) {
    test(`T039 historical panel compatibility ${variant} is classified without automatic repair`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            await f.db.operation.update({ where: { id: f.operationId }, data: {
                status: 'REVIEW_REQUIRED', purpose: variant === 'installment' ? 'INSTALLMENT' : null,
                providerPaymentState: null, providerMutationStartedAt: null, providerMutationStage: null,
                ...(variant === 'negative-amount' ? { amount: -174 } : {}),
                ...(variant === 'empty-package' ? { selectedPackage: { name: '', price: 174 } } : {}),
                ...(variant === 'alias' ? { selectedPackage: { name: 'Historical provider alias', price: 174 } } : {}),
            } })
            if (variant === 'absent-deduction') await f.db.transaction.deleteMany({ where: { operationId: f.operationId } })
            const before = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
            const transactions = await f.db.transaction.findMany({ where: { operationId: f.operationId } })
            const report = await inspectPanelReviewCompatibility(f.db, { operationIds: [f.operationId] })
            const expected = ['negative-amount', 'absent-deduction'].includes(variant) ? 'CONFLICT'
                : variant === 'installment' ? 'INSTALLMENT' : 'LEGACY_RENEWAL'
            assert.equal(report.categories[expected], 1)
            assert.equal(report.financialWrites, 0)
            assert.equal(report.providerRequests, 0)
            assert.equal(report.complete, true)
            assert.deepEqual(await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } }), before)
            assert.deepEqual(await f.db.transaction.findMany({ where: { operationId: f.operationId } }), transactions)
            assert.equal(await f.db.operationCompletionEffect.count({ where: { operationId: f.operationId } }), 0)
            assert.equal(JSON.stringify(report).includes(f.cardNumber), false)
        })
    })
}

test('T039 old dispatch inserts retain immutable zero revision and receive a due-time default', { skip }, async () => {
    await withAuditOperationFixture('old-dispatch', async f => {
        const row = await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })
        assert.equal(row.actionRevision, 0)
        assert.equal(row.attempts, 0)
        assert.equal(row.status, 'PENDING')
        assert.ok(row.nextAttemptAt instanceof Date)
        const indexes = await f.db.$queryRaw<Array<{ indexname: string }>>`
            SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'operation_dispatches'
        `
        assert.ok(indexes.some(index => index.indexname === 'operation_dispatches_status_next_attempt_at_idx'))
        assert.ok(indexes.some(index => index.indexname === 'operation_dispatches_status_updated_at_idx'))
        assert.equal(await f.db.operationCompletionEffect.count({ where: { operationId: f.operationId } }), 0)
    })
})
