import test from 'node:test'
import assert from 'node:assert/strict'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { loadDispatch, loadPanelSelection, loadPanelConfirmation, loadPanelPromo, type RevisionJob } from '../helpers/promo-dispatch-harness'
import { holdQuoteConflict, publishPromoQuote } from '../../worker/src/lib/promo-quote'
import { quoteData, readyPackageQuote, selectQuotedPackage } from '../../shared/operations/package-quote'

for (const scenario of ['safe', 'deduction', 'mutation', 'final-dispatch', 'wrong-account', 'stale-lease'] as const) {
    test(`review repair PostgreSQL pre-sale quote closure: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            if (scenario !== 'deduction') await f.db.transaction.deleteMany({ where: { operationId: f.operationId } })
            const selected = { index: 0, name: 'Synthetic', price: 174, quoteRevision: 2 }
            await f.db.cardLifecycleReservation.create({ data: { operationId: f.operationId, cardNumber: f.cardNumber } })
            await f.db.providerAccountCausalReservation.create({ data: { operationId: f.operationId,
                beinAccountId: f.accountId, automaticWindowEndsAt: new Date(Date.now() + 60_000) } })
            await f.db.operation.update({ where: { id: f.operationId }, data: {
                amount: scenario === 'deduction' ? 174 : 0, selectedPackage: selected,
                responseData: { quoteRevision: 2, operationPhase: 'PACKAGE_PREPARATION', finalPaySubmitted: false },
                ...(scenario === 'mutation' ? { providerMutationStartedAt: new Date(), providerMutationStage: 'FINAL_OK' } : {}),
            } })
            if (scenario === 'final-dispatch') await loadDispatch().createOperationDispatch(f.db, {
                operationId: f.operationId, userId: f.userId, cardNumber: f.cardNumber, type: 'CONFIRM_PURCHASE',
            })
            const input = { operationId: f.operationId, revision: 2, selectedPackage: selected,
                preSale: { beinAccountId: scenario === 'wrong-account' ? 'foreign' : f.accountId } }
            if (scenario === 'stale-lease') {
                await assert.rejects(holdQuoteConflict(f.db, input, async () => { throw new Error('LEASE_LOST') }), /LEASE_LOST/)
                assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })).status, 'COMPLETING')
                return
            }
            assert.equal(await holdQuoteConflict(f.db, input, async () => undefined), true)
            const result = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
            assert.equal(result.status, scenario === 'safe' ? 'FAILED' : 'REVIEW_REQUIRED')
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId, type: 'REFUND' } }), 0)
            for (const reservation of [
                await f.db.cardLifecycleReservation.findUniqueOrThrow({ where: { operationId: f.operationId } }),
                await f.db.providerAccountCausalReservation.findUniqueOrThrow({ where: { operationId: f.operationId } }),
            ]) assert.equal(reservation.releasedAt !== null, scenario === 'safe')
            assert.equal(await holdQuoteConflict(f.db, input, async () => undefined), false)
        })
    })
}

for (const scenario of ['current', 'newer-quote', 'already-finished', 'final-payment'] as const) {
    test(`review repair PostgreSQL exhausted dispatch: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            const responseData = { quoteRevision: scenario === 'newer-quote' ? 2 : 1,
                quoteState: scenario === 'already-finished' ? 'READY' : 'PENDING',
                refreshing: scenario !== 'already-finished', requestedPromoCode: 'CODE' }
            await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'AWAITING_PACKAGE', responseData } })
            const h = loadDispatch(f.db)
            await h.createOperationDispatch(f.db, { operationId: f.operationId, userId: f.userId, cardNumber: f.cardNumber,
                type: scenario === 'final-payment' ? 'CONFIRM_PURCHASE' : 'APPLY_PROMO',
                actionRevision: scenario === 'final-payment' ? 0 : 1, promoCode: 'CODE' })
            const row = await f.db.operationDispatch.findFirstOrThrow({ where: { operationId: f.operationId } })
            await f.db.operationDispatch.update({ where: { id: row.id }, data: { attempts: 3 } })
            const results = await Promise.all([h.settlePreparationDispatchExhaustion(row.id, 3), h.settlePreparationDispatchExhaustion(row.id, 3)])
            assert.equal(results.filter(Boolean).length, scenario === 'final-payment' ? 0 : 1)
            const op = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
            assert.equal(op.status, 'AWAITING_PACKAGE')
            if (scenario === 'current') {
                assert.equal(quoteData(op.responseData).quoteState, 'FAILED')
                assert.equal(quoteData(op.responseData).refreshing, false)
                assert.equal(await publishPromoQuote(f.db, { operationId: f.operationId, revision: 1,
                    promoCode: 'CODE', promoAction: 'APPLY', result: { success: true, packages: [] } }), false)
            } else assert.deepEqual(quoteData(op.responseData), responseData)
        })
    })
}

for (const scenario of ['new-revision', 'replay', 'changed-payload', 'final-payment-revision'] as const) {
    test(`T015 PostgreSQL dispatch: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            const { createOperationDispatch } = loadDispatch()
            const job: RevisionJob = { operationId: f.operationId, userId: f.userId, cardNumber: f.cardNumber,
                type: scenario === 'final-payment-revision' ? 'CONFIRM_PURCHASE' : 'APPLY_PROMO', actionRevision: 1, promoCode: 'FIRST' }
            const create = (data: RevisionJob) => f.db.$transaction(tx => createOperationDispatch(tx, data))
            if (scenario === 'final-payment-revision') {
                await assert.rejects(create(job), /ACTION_REVISION/)
                assert.equal(await f.db.operationDispatch.count({ where: { operationId: f.operationId } }), 0)
                return
            }
            await create(job)
            if (scenario === 'changed-payload') await assert.rejects(create({ ...job, promoCode: 'OTHER' }), /PAYLOAD_CONFLICT/)
            else await create(scenario === 'new-revision' ? { ...job, actionRevision: 2, promoCode: 'SECOND' } : job)
            const rows = await f.db.operationDispatch.findMany({ where: { operationId: f.operationId }, orderBy: { actionRevision: 'asc' } })
            assert.deepEqual(rows.map(r => r.actionRevision), scenario === 'new-revision' ? [1, 2] : [1])
        })
    })
}

test('T016 PostgreSQL publish fences stale/code-mismatched/duplicate promo results and preserves financial records', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'AWAITING_PACKAGE',
            responseData: { quoteRevision: 2, quoteState: 'PENDING', refreshing: true, promoAction: 'APPLY', requestedPromoCode: 'SECOND' },
            availablePackages: [{ index: 1, name: 'Synthetic original 12 months', price: 200 }],
        } })
        const before = await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })
        const deductions = await f.db.transaction.count({ where: { operationId: f.operationId } })
        const input = { operationId: f.operationId, revision: 2, promoCode: 'SECOND', promoAction: 'APPLY' as const,
            result: { success: true, packages: [{ index: 4, name: 'Synthetic promo 12 months', price: 174, checkboxValue: 'new-row' }] } }
        assert.equal(await publishPromoQuote(f.db, { ...input, revision: 1 }), false)
        assert.equal(await publishPromoQuote(f.db, { ...input, promoCode: 'OTHER' }), false)
        assert.equal(await publishPromoQuote(f.db, input), true)
        assert.equal(await publishPromoQuote(f.db, input), false)
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'CANCELLED' } })
        assert.equal(await publishPromoQuote(f.db, input), false)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, before.balance)
        assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), deductions)
        assert.equal(await f.db.operationDispatch.count({ where: { operationId: f.operationId } }), 0)
    })
})

test('T016 PostgreSQL quote hold preserves current evidence and rejects stale state, snapshot and lease', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const selected = { index: 0, name: 'Synthetic', price: 174, quoteRevision: 2 }
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETING',
            selectedPackage: selected, responseData: { quoteRevision: 2, newerEvidence: { retained: true } },
        } })
        const input = { operationId: f.operationId, revision: 2, selectedPackage: selected }
        const fence = async () => undefined
        assert.equal(await holdQuoteConflict(f.db, { ...input, revision: 1 }, fence), false)
        assert.equal(await holdQuoteConflict(f.db, { ...input, selectedPackage: { ...selected, price: 175 } }, fence), false)
        await assert.rejects(holdQuoteConflict(f.db, input, async () => { throw new Error('LEASE_LOST') }), /LEASE_LOST/)
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'AWAITING_FINAL_CONFIRM' } })
        assert.equal(await holdQuoteConflict(f.db, input, fence), false)
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'COMPLETING' } })
        assert.equal(await holdQuoteConflict(f.db, input, fence), true)
        const current = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
        assert.equal(current.status, 'REVIEW_REQUIRED')
        assert.deepEqual(quoteData(current.responseData).newerEvidence, { retained: true })
        assert.equal(quoteData(current.responseData).quoteConflict, true)
    })
})

for (const scenario of ['current', 'stale', 'refreshing'] as const) {
    test(`T015 PostgreSQL panel selection: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            // Preparation precedes any panel deduction. Remove only this fixture's
            // synthetic deduction; no snapshot or interactive records are used.
            await f.db.transaction.deleteMany({ where: { operationId: f.operationId } })
            await f.db.user.update({ where: { id: f.userId }, data: { balance: 500 } })
            await f.db.operation.update({ where: { id: f.operationId }, data: {
                status: 'AWAITING_PACKAGE', amount: 0, selectedPackage: undefined,
                availablePackages: [{ index: 3, name: 'Synthetic package', price: 174 }],
                responseData: { quoteRevision: 2, refreshing: scenario === 'refreshing' },
            } })
            const h = loadPanelSelection(f.db, f.userId, true)
            const response = await h.POST(new Request('http://localhost/api/operations/synthetic/select-package', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ packageIndex: 3, quoteRevision: scenario === 'stale' ? 1 : 2 }),
            }), { params: Promise.resolve({ id: f.operationId }) })
            assert.equal(response.status, scenario === 'current' ? 200 : 409)
            const operation = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
            assert.equal(operation.status, scenario === 'current' ? 'COMPLETING' : 'AWAITING_PACKAGE')
            assert.equal(h.dispatched(), scenario === 'current' ? 1 : 0)
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 0)
            assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, 500)
        })
    })
}

for (const scenario of ['stale', 'changed-price', 'concurrent'] as const) {
    test(`T017 PostgreSQL final quote: ${scenario}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            const packages = [{ index: 3, name: 'Synthetic promo 12 months', price: 174 }]
            const responseData = readyPackageQuote({}, packages, 2, 'APPLIED')
            const selectedPackage = selectQuotedPackage({ responseData, availablePackages: packages, promoCode: 'APPLIED' },
                { packageIndex: 3, quoteRevision: 2 }).selectedPackage
            await f.db.transaction.deleteMany({ where: { operationId: f.operationId } })
            await f.db.user.update({ where: { id: f.userId }, data: { balance: 500 } })
            await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'AWAITING_FINAL_CONFIRM',
                amount: 0, availablePackages: packages, promoCode: 'APPLIED', responseData: JSON.stringify(responseData),
                selectedPackage: scenario === 'changed-price' ? { ...selectedPackage, price: 175 } : selectedPackage,
                finalConfirmExpiry: new Date(Date.now() + 60_000),
            } })
            const h = loadPanelConfirmation(f.db, f.userId, true)
            const confirm = () => h.POST(new Request('http://localhost/synthetic', { method: 'POST',
                body: JSON.stringify({ quoteRevision: scenario === 'stale' ? 1 : 2 }) }), { params: Promise.resolve({ id: f.operationId }) })
            const responses = await Promise.all(scenario === 'concurrent' ? [confirm(), confirm()] : [confirm()])
            assert.equal(responses.filter(r => r.status === 200).length, scenario === 'concurrent' ? 1 : 0)
            if (scenario !== 'concurrent') assert.equal(responses[0].status, 409)
            assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, scenario === 'concurrent' ? 326 : 500)
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), scenario === 'concurrent' ? 1 : 0)
            assert.equal(await f.db.operationDispatch.count({ where: { operationId: f.operationId } }), scenario === 'concurrent' ? 1 : 0)
        })
    })
}

test('T017 PostgreSQL panel selection freezes the applied code and rejects edited/cleared drafts', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        await f.db.user.update({ where: { id: f.userId }, data: { balance: 500 } })
        const packages = [{ index: 3, name: 'Synthetic accepted promo', price: 174 }]
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'AWAITING_PACKAGE', amount: 0,
            finalConfirmExpiry: new Date(Date.now() + 60_000), availablePackages: packages, promoCode: 'APPLIED',
            responseData: JSON.stringify(readyPackageQuote({}, packages, 2, 'APPLIED')),
        } })
        const h = loadPanelSelection(f.db, f.userId, true)
        for (const promoCode of ['EDITED', '', undefined]) {
            const res = await h.POST(new Request('http://localhost/synthetic', { method: 'POST',
                body: JSON.stringify({ packageIndex: 3, quoteRevision: 2, promoCode }) }), { params: Promise.resolve({ id: f.operationId }) })
            assert.equal(res.status, promoCode === undefined ? 200 : 409)
        }
        const op = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
        assert.equal(op.promoCode, 'APPLIED')
        assert.equal(quoteData(op.selectedPackage).appliedPromoCode, 'APPLIED')
        assert.equal(quoteData(op.selectedPackage).quoteRevision, 2)
        assert.equal(h.dispatched(), 1)
    })
})

test('T017 PostgreSQL explicit REMOVE travels from applied code through admission and worker publish to ordinary quote', { skip }, async () => {
    await withAuditOperationFixture('reseller', async f => {
        const packages = [{ index: 3, name: 'Synthetic applied promo', price: 174, checkboxValue: 'promo' }]
        await f.db.operation.update({ where: { id: f.operationId }, data: { status: 'AWAITING_PACKAGE', amount: 0,
            finalConfirmExpiry: new Date(Date.now() + 60_000), availablePackages: packages, promoCode: 'APPLIED',
            responseData: JSON.stringify(readyPackageQuote({}, packages, 2, 'APPLIED')),
        } })
        const before = (await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance
        const h = loadPanelPromo(f.db, f.userId)
        const response = await h.POST(new Request('http://localhost/synthetic', { method: 'POST',
            body: JSON.stringify({ actionRevision: 3, promoAction: 'REMOVE' }) }), { params: Promise.resolve({ id: f.operationId }) })
        assert.equal(response.status, 202)
        const pending = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
        assert.equal(pending.promoCode, 'APPLIED')
        assert.equal(quoteData(pending.responseData).requestedPromoCode, null)
        assert.equal(await publishPromoQuote(f.db, { operationId: f.operationId, revision: 3, promoAction: 'REMOVE',
            result: { success: true, packages: [{ index: 4, name: 'Synthetic ordinary', price: 200, checkboxValue: 'ordinary' }] } }), true)
        const ready = await f.db.operation.findUniqueOrThrow({ where: { id: f.operationId } })
        assert.equal(ready.promoCode, null)
        assert.equal(quoteData(ready.responseData).quoteState, 'READY')
        assert.equal(quoteData(ready.responseData).appliedPromoCode, null)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.userId } })).balance, before)
    })
})
