import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { loadReviewFinalizers } from '../helpers/financial-review-harness'

for (const scenario of ['complete', 'demoted', 'deleted', 'no-deduction', 'refund-pending', 'blank-invoice',
    'wrong-currency', 'wrong-card', 'wrong-amount', 'wrong-account', 'old-observation', 'installment', 'claimed-invoice', 'deduction-drift'] as const) {
    test(`T024 legacy adjudication: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'REVIEW_REQUIRED',
                purpose: scenario === 'installment' ? 'INSTALLMENT' : null,
                providerMutationStartedAt: null, providerMutationStage: null, providerPaymentState: null,
                selectedPackage: { name: 'Synthetic package', price: 174 } } })
            if (scenario === 'no-deduction') await f.db.transaction.deleteMany({ where: { operationId: f.operationId } })
            if (scenario === 'refund-pending') await f.db.renewalRefundSettlement.create({ data: f.settlementData() })
            if (scenario === 'claimed-invoice') await f.db.providerInvoiceClaim.create({ data: {
                operationId: f.operationId, beinAccountId: f.accountId, invoiceNo: f.marker + '-invoice', claimKind: 'MANUAL_PROVIDER_CONFIRMATION',
            } })
            if (scenario === 'deduction-drift') await f.db.transaction.updateMany({ where: { operationId: f.operationId }, data: { amount: -1 } })
            if (scenario === 'demoted' || scenario === 'deleted') await f.db.user.update({ where: { id: f.userId },
                data: scenario === 'demoted' ? { role: 'USER' } : { deletedAt: new Date() } })
            const h = loadReviewFinalizers(f.db)
            const input = { operationId: f.operationId, actorUsername: f.marker, decisionNote: 'Synthetic attributable receipt',
                decisionKey: f.marker + '-decision', sourceReference: 'synthetic:receipt:1', evidence: {
                    beinAccountId: scenario === 'wrong-account' ? 'other' : f.accountId,
                    invoiceNo: scenario === 'blank-invoice' ? ' ' : f.marker + '-invoice',
                    cardNumberSnapshot: scenario === 'wrong-card' ? '7100000000' : f.cardNumber,
                    packageNameSnapshot: 'Synthetic package', providerAmount: scenario === 'wrong-amount' ? '175' : '174',
                    currency: scenario === 'wrong-currency' ? 'EUR' : 'USD', evidenceSource: 'BEIN_SUPPORT_CONFIRMATION',
                    evidenceNote: 'Synthetic provider execution receipt; no external call.',
                    observedAt: scenario === 'old-observation' ? new Date(0) : new Date(), actorUserId: f.userId,
                } }
            const results = await Promise.all([h.finalizeLegacyReview(input), h.finalizeLegacyReview(input)])
            if (scenario === 'complete') {
                assert.deepEqual(results.map(r => r.status).sort(), ['ALREADY_COMPLETED', 'COMPLETED'])
                assert.equal((await h.finalizeLegacyReview({ ...input, decisionNote: 'Changed decision' })).status, 'PROOF_CONFLICT')
            } else assert.ok(results.every(r => r.status === 'PROOF_CONFLICT' || r.status === 'INVALID_EVIDENCE'))
            const op = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
            assert.equal(op.status, scenario === 'complete' ? 'COMPLETED' : 'REVIEW_REQUIRED')
            assert.equal(op.providerMutationStartedAt, null)
            assert.equal(op.providerMutationStage, null)
            assert.equal(op.providerPaymentState, null, 'manual execution must not invent provider debit evidence')
            assert.equal(await f.db.operationReviewAdjudication.count({ where: { operationId: f.operationId } }), scenario === 'complete' ? 1 : 0)
            assert.equal(await f.db.providerInvoiceClaim.count({ where: { operationId: f.operationId } }), ['complete', 'claimed-invoice'].includes(scenario) ? 1 : 0)
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId, type: 'REFUND' } }), 0)
        })
    })
}
