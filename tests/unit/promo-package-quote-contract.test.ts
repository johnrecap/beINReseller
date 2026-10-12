import test from 'node:test'
import assert from 'node:assert/strict'
import { readyPackageQuote, publicPackageQuote, selectQuotedPackage, assertFinalQuote } from '../../shared/operations/package-quote'
import { loadPanelPromo, loadPanelPackages, loadPanelConfirmation } from '../helpers/promo-dispatch-harness'

const packages = [{ index: 3, name: 'Synthetic 12 months Save 10%', price: 174, checkboxValue: 'private-control' }]
const ready = readyPackageQuote({}, packages, 2, 'APPLIED')
const operation = { availablePackages: packages, responseData: ready, promoCode: 'APPLIED' }

test('actual packages endpoint exposes pending revision instead of certifying its old list', async () => {
    const h = loadPanelPackages({ ...operation, id: 'synthetic', userId: 'user', status: 'AWAITING_PACKAGE',
        responseData: { ...ready, quoteState: 'PENDING', refreshing: true } }, 'user')
    const res = await h.GET(new Request('http://localhost/synthetic'), { params: Promise.resolve({ id: 'synthetic' }) })
    const data = await res.json()
    assert.equal(data.quoteState, 'PENDING')
    assert.equal(data.quoteRevision, 2)
    assert.equal(data.packages[0].checkboxValue, undefined)
})

test('actual final confirmation rejects stale consent before any transaction or deduction writes', async () => {
    const selectedPackage = selectQuotedPackage(operation, { quoteRevision: 2, packageIndex: 3 }).selectedPackage
    const op = { ...operation, selectedPackage, id: 'synthetic', userId: 'user', cardNumber: 'synthetic-card',
        status: 'AWAITING_FINAL_CONFIRM', amount: 0, finalConfirmExpiry: null }
    let writes = 0
    const tx = { operation: { findUnique: async () => op, updateMany: async () => { writes++; throw new Error('UNEXPECTED_WRITE') } } }
    const h = loadPanelConfirmation({ operation: tx.operation, $transaction: async (run: (tx: unknown) => unknown) => run(tx) }, 'user')
    const response = await h.POST(new Request('http://localhost/synthetic', { method: 'POST',
        body: JSON.stringify({ quoteRevision: 1 }) }), { params: Promise.resolve({ id: 'synthetic' }) })
    assert.equal(response.status, 409)
    assert.equal(writes, 0)
})

test('quote projection binds display packages to revision without exposing provider controls', () => {
    const quote = publicPackageQuote(operation)
    assert.equal(quote.quoteRevision, 2)
    assert.equal(quote.appliedPromoCode, 'APPLIED')
    assert.equal(quote.packages[0].name, packages[0].name)
    assert.equal('checkboxValue' in quote.packages[0], false)
    assert.equal(selectQuotedPackage(operation, { quoteRevision: 2, packageKey: quote.packages[0].packageKey }).promoCode, 'APPLIED')
})

test('stale/reordered quote and conflicting draft promo cannot change the selected package', () => {
    assert.throws(() => selectQuotedPackage(operation, { quoteRevision: 1, packageIndex: 3 }), /STALE_PACKAGE_QUOTE/)
    assert.throws(() => selectQuotedPackage(operation, { quoteRevision: 2, packageIndex: 3, promoCode: 'DRAFT' }), /PROMO_QUOTE_CONFLICT/)
    assert.throws(() => selectQuotedPackage(operation, { quoteRevision: 2, packageIndex: 3, promoCode: '' }), /PROMO_QUOTE_CONFLICT/)
})

for (const quoteState of ['PENDING', 'FAILED'] as const) {
    test(`${quoteState} response with old packages is never selectable`, () => {
        const pending = { ...operation, responseData: { ...ready, quoteState, refreshing: quoteState === 'PENDING' } }
        assert.equal(publicPackageQuote(pending).quoteState, quoteState)
        assert.throws(() => selectQuotedPackage(pending, { quoteRevision: 2, packageIndex: 3 }), /PACKAGE_QUOTE_NOT_READY/)
    })
}

test('a renamed new quote invalidates the old selection and uses the provider display name', () => {
    const renamed = [{ ...packages[0], name: 'Synthetic offer 12 months Save 15%', price: 165 }]
    const newer = { ...operation, availablePackages: renamed, responseData: readyPackageQuote(ready, renamed, 3, 'NEW') }
    const oldKey = publicPackageQuote(operation).packages[0].packageKey
    assert.throws(() => selectQuotedPackage(newer, { quoteRevision: 3, packageKey: oldKey }), /PACKAGE_NOT_FOUND/)
    const selected = selectQuotedPackage(newer, { quoteRevision: 3, packageIndex: 3 })
    assert.equal(selected.selectedPackage.name, renamed[0].name)
    assert.equal(selected.selectedPackage.quoteRevision, 3)
    assert.equal(selected.promoCode, 'NEW')
})

test('final confirmation requires the accepted current quote and never a stale revision', () => {
    const selected = selectQuotedPackage(operation, { quoteRevision: 2, packageIndex: 3 }).selectedPackage
    assert.doesNotThrow(() => assertFinalQuote({ ...operation, selectedPackage: selected }, 2))
    assert.throws(() => assertFinalQuote({ ...operation, selectedPackage: { ...selected, currency: 'EUR' } }, 2), /PACKAGE_QUOTE_CONFLICT/)
    assert.throws(() => assertFinalQuote({ ...operation, selectedPackage: selected }, 1), /STALE_PACKAGE_QUOTE/)
    assert.throws(() => assertFinalQuote({ ...operation, selectedPackage: { ...selected, price: 1 } }, 2), /PACKAGE_QUOTE_CONFLICT/)
})

test('an explicitly removed promo produces a ready ordinary quote; draft input is not authority', () => {
    const removed = { ...operation, promoCode: null, responseData: readyPackageQuote(ready, packages, 3, null) }
    assert.equal(selectQuotedPackage(removed, { quoteRevision: 3, packageIndex: 3 }).promoCode, null)
})

test('actual apply API creates one pending revision, replays it, and rejects changed payload identity', async () => {
    let current = { id: 'synthetic-op', userId: 'synthetic-user', cardNumber: 'synthetic-card', status: 'AWAITING_PACKAGE',
        availablePackages: packages, responseData: readyPackageQuote({}, packages, 0, null), finalConfirmExpiry: null }
    const rows: { payload: unknown; status: string }[] = []
    const tx = { operation: { findUnique: async () => current, findUniqueOrThrow: async () => current, update: async ({ data }: { data: object }) => {
        current = { ...current, ...data }; return current
    } }, operationDispatch: { findUnique: async () => rows[0] || null,
        create: async ({ data }: { data: typeof rows[number] }) => { rows.push(data) } } }
    const db = { ...tx, $transaction: async (run: (tx: unknown) => unknown) => run(tx) }
    const api = loadPanelPromo(db, 'synthetic-user')
    const send = (code: string) => api.POST(new Request('http://localhost/api/operations/synthetic-op/apply-promo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ promoCode: code, actionRevision: 1 }),
    }), { params: Promise.resolve({ id: 'synthetic-op' }) })
    const first = await send('FIRST')
    assert.equal(first.status, 202)
    assert.equal((await first.json()).quoteState, 'PENDING')
    assert.equal((await send('FIRST')).status, 202)
    assert.equal(rows.length, 1)
    assert.equal((await send('OTHER')).status, 409)
    assert.equal(rows.length, 1)
})
