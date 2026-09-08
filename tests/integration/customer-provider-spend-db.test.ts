import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'

for (const kind of ['reseller', 'customer'] as const) {
    test(`provider ledger derives ${kind} owner and serializes replay`, { skip }, async () => {
        await withAuditOperationFixture(kind, async f => {
            const { recordConfirmedBeinSpend } = await import('../../worker/src/lib/bein-spend-ledger')
            const input = { operationId: f.operationId, beinAccountId: f.accountId,
                dealerBalanceBefore: 1000, dealerBalanceAfter: 826, evidenceSource: 'BALANCE_DELTA' as const,
                balanceBeforeSource: 'final_pay_ok_page' as const, balanceAfterSource: 'final_pay_result_page' as const }
            const results = await Promise.all([recordConfirmedBeinSpend(input, f.db), recordConfirmedBeinSpend(input, f.db)])
            assert.deepEqual(results.map(r => r.status).sort(), ['already_recorded', 'created'])
            const ledger = await f.db.beinAccountSpendLedger.findUniqueOrThrow({ where: { operationId: f.operationId } })
            assert.equal(ledger.userId, kind === 'reseller' ? f.userId : null)
            assert.equal(ledger.customerId, kind === 'customer' ? f.customerId : null)
            assert.equal(ledger.spendAmount, 174) // not customer retail 209
            const { getBeinSpendOperations, getBeinSpendSummary } = await import('../../src/lib/bein-spend-ledger')
            const filters = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000),
                groupBy: 'none' as const, beinAccountId: f.accountId, includeUnconfirmed: false }
            const report = await getBeinSpendOperations(filters, { page: 1, pageSize: 10 })
            assert.equal(report.total, 1)
            assert.equal(report.items[0].panelUserId, ledger.userId)
            assert.equal(report.items[0].customerId, ledger.customerId)
            assert.equal((await getBeinSpendSummary(filters)).totals.confirmedSpend, 174)
            assert.equal((await recordConfirmedBeinSpend({ ...input, dealerBalanceAfter: 825 }, f.db)).status, 'conflict_review_required')
            assert.equal((await recordConfirmedBeinSpend({ ...input, userId: 'wrong-owner' }, f.db)).status, 'conflict_review_required')
            assert.equal((await recordConfirmedBeinSpend({ ...input, beinAccountId: 'wrong-account' }, f.db)).status, 'conflict_review_required')
            assert.equal(await f.db.beinAccountSpendLedger.count({ where: { operationId: f.operationId } }), 1)
            assert.equal(await f.db.pointLedgerEntry.count({ where: { operationId: f.operationId } }), 0)
        })
    })
}
