import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'

for (const scenario of ['rejected', 'missing-deduction', 'unknown', 'charged-unknown', 'settled', 'duplicate-claim', 'rollback', 'wrong-due-item', 'positive-spend-rejection'] as const) {
    test(`installment settlement: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('installment', async f => {
            const { finalizeInstallmentSettlement, claimInstallmentMutation } = await import('../../worker/src/lib/installment-finalization')
            await f.db.operation.update({ where: { id: f.operationId }, data: {
                providerMutationStartedAt: f.now, providerMutationStage: 'FINAL_OK', providerPaymentState: 'UNKNOWN',
                responseData: { installmentId: 'synthetic-due-item' },
            } })
            await f.db.cardLifecycleReservation.create({ data: { operationId: f.operationId, cardNumber: f.cardNumber } })
            if (scenario === 'duplicate-claim') {
                const result = await claimInstallmentMutation({ operationId: f.operationId, beinAccountId: f.accountId,
                    installmentId: 'synthetic-due-item' }, f.db)
                assert.equal(result.status, 'ALREADY_CLAIMED')
                return
            }
            const rejected = ['rejected', 'missing-deduction', 'rollback', 'wrong-due-item', 'positive-spend-rejection'].includes(scenario)
            await f.db.operationInstallmentEvidence.update({ where: { operationId: f.operationId }, data: {
                paymentState: rejected ? 'NOT_CHARGED' : scenario === 'unknown' ? 'UNKNOWN' : 'CHARGED',
                settlementState: rejected ? 'NOT_SETTLED' : scenario === 'settled' ? 'SETTLED' : 'UNKNOWN',
                rejectionReference: rejected ? 'synthetic-provider-rejection' : null,
                settlementReference: scenario === 'settled' ? 'synthetic-provider-receipt' : null,
                amount: 174, currency: 'USD',
            } })
            if (scenario === 'wrong-due-item') await f.db.operation.update({ where: { id: f.operationId },
                data: { responseData: { installmentId: 'different-due-item' } } })
            if (scenario === 'missing-deduction') await f.db.transaction.deleteMany({ where: { operationId: f.operationId } })
            if (scenario === 'settled' || scenario === 'charged-unknown' || scenario === 'positive-spend-rejection') await f.db.beinAccountSpendLedger.create({ data: f.spendData() })
            const input = { operationId: f.operationId, expectedCorrelationKey: f.marker + '-attempt' }
            if (scenario === 'rejected' || scenario === 'rollback') await f.db.pointLedgerEntry.create({ data: {
                operationId: f.operationId, ownerUserId: f.userId, ownerRoleAtTime: 'ADMIN',
                sourceType: 'OPERATION_SPEND', sourceId: f.marker + '-points', points: 10, status: 'AVAILABLE',
            } })
            if (scenario === 'rollback') {
                await assert.rejects(f.db.$transaction(async tx => {
                    await finalizeInstallmentSettlement(input, { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } as never)
                    throw new Error('SYNTHETIC_CRASH_BEFORE_COMMIT')
                }), /SYNTHETIC_CRASH_BEFORE_COMMIT/)
                assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId, type: 'REFUND' } }), 0)
                assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })).status, 'COMPLETING')
                return
            }
            const results = await Promise.all([finalizeInstallmentSettlement(input, f.db), finalizeInstallmentSettlement(input, f.db)])
            const op = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
            const terminal = scenario === 'rejected' || scenario === 'settled'
            assert.equal(op.status, scenario === 'rejected' ? 'FAILED' : scenario === 'settled' ? 'COMPLETED' : 'REVIEW_REQUIRED')
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId, type: 'REFUND' } }), scenario === 'rejected' ? 1 : 0)
            assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, scenario === 'rejected' ? 174 : 0)
            assert.equal(Boolean((await f.db.cardLifecycleReservation.findUniqueOrThrow({ where: { operationId: f.operationId } })).releasedAt), terminal)
            assert.equal(results.length, 2)
            if (scenario === 'rejected') {
                assert.equal((await f.db.pointLedgerEntry.aggregate({ where: { operationId: f.operationId }, _sum: { points: true } }))._sum.points, 0)
                assert.equal(await f.db.pointLedgerEntry.count({ where: { operationId: f.operationId, sourceType: 'POINT_REVERSAL' } }), 1)
            }
        })
    })
}

test('installment mutation claim is single-use and rejects stale reservation generation', { skip }, async () => {
    await withAuditOperationFixture('installment', async f => {
        const { claimInstallmentMutation } = await import('../../worker/src/lib/installment-finalization')
        await f.db.operationInstallmentEvidence.deleteMany({ where: { operationId: f.operationId } })
        await f.db.operation.update({ where: { id: f.operationId }, data: { responseData: { installmentId: 'synthetic-due-item' } } })
        await f.db.cardLifecycleReservation.create({ data: { operationId: f.operationId, cardNumber: f.cardNumber } })
        await f.db.providerAccountCausalReservation.create({ data: { operationId: f.operationId, beinAccountId: f.accountId,
            automaticWindowEndsAt: new Date(Date.now() + 60_000), reservationGeneration: 2 } })
        const input = { operationId: f.operationId, beinAccountId: f.accountId, installmentId: 'synthetic-due-item', reservationGeneration: 2 }
        assert.equal((await claimInstallmentMutation({ ...input, reservationGeneration: 1 }, f.db)).status, 'REVIEW_REQUIRED')
        const results = await Promise.all([claimInstallmentMutation(input, f.db), claimInstallmentMutation(input, f.db)])
        assert.deepEqual(results.map(r => r.status).sort(), ['ALREADY_CLAIMED', 'CLAIMED'])
        const evidence = await f.db.operationInstallmentEvidence.findUniqueOrThrow({ where: { operationId: f.operationId } })
        assert.equal(evidence.paymentState, 'UNKNOWN')
        assert.equal(evidence.settlementState, 'UNKNOWN')
        assert.equal((await claimInstallmentMutation(input, f.db)).status, 'ALREADY_CLAIMED')
    })
})
