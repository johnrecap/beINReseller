import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as receipts from '../../src/lib/operations/receipt'
import type { getUserStatsReport } from '../../src/lib/users/stats-report'

const proof = {
    proofKind: 'SOLD_REPORT_SAME_DAY', invoiceNo: 'SYNTHETIC-INVOICE', cardNumberSnapshot: 'PRIVATE-CARD',
    reportItemType: 'Card_CISCO', reportPackageName: 'Together 6 Months + 20% OFF (6 Months)',
    promoCodeSnapshot: 'PRIVATE-PROMO', providerAmount: new Prisma.Decimal('43.20'), currency: 'USD',
    contractStartDate: null, contractExpiryDate: null, reportDate: new Date('2026-10-13'),
    reportObservedAt: new Date('2026-10-13T10:00:00Z'), customerChargedAmount: new Prisma.Decimal('48.00'),
}
const operation = (id: string, overrides = {}) => ({
    id, userId: 'owner', status: 'COMPLETED', fulfillmentAuthority: 'AUTOMATED_REPORT', fulfillmentProof: proof,
    ...overrides,
})
const page = { txLimit: 20, txSkip: 0, opLimit: 20, opSkip: 0 }

function harness(fail = false) {
    const queries: Record<string, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
    const logs: unknown[][] = []
    const records = [operation('visible'), operation('off-page'), operation('foreign', { userId: 'other' }),
        operation('legacy', { fulfillmentAuthority: 'AUTOMATED_COMPOSITE' }),
        operation('failed', { status: 'FAILED' }), operation('review', { status: 'REVIEW_REQUIRED' }),
        operation('incomplete', { fulfillmentProof: { ...proof, reportDate: null } })]
    const transactions = ['visible', 'off-page', 'foreign'].map(id => ({
        id: `deduct-${id}`, type: 'OPERATION_DEDUCT', amount: -48, operationId: id,
    }))
    transactions.push(...['DEPOSIT', 'REFUND', 'WITHDRAW', 'CORRECTION'].map(type => ({
        id: type, type, amount: 48, operationId: 'visible',
    })))
    const db = {
        user: { findUnique: async () => ({ id: 'owner', balance: 0 }) },
        transaction: { findMany: async () => transactions, count: async () => transactions.length },
        operation: {
            groupBy: async () => [], count: async () => 6,
            findMany: async (query: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                queries.push(query)
                if (query.select.fulfillmentProof) {
                    if (fail) throw new Error('PRIVATE-CARD PRIVATE-PROMO PRIVATE-COOKIE')
                    return records.filter(row => row.userId === query.where.userId && query.where.id.in.includes(row.id))
                }
                if (query.take !== undefined) return records.filter(row => !['off-page', 'foreign'].includes(row.id))
                    .map(({ id, status }) => ({ id, status, type: 'RENEW' }))
                return []
            },
        },
    }
    const { getUserStatsReport: report } = loadIsolatedModule<{ getUserStatsReport: typeof getUserStatsReport }>(
        'src/lib/users/stats-report.ts', {
            '@/lib/prisma': { default: db }, '@/lib/operations/receipt': receipts,
        }, [], {}, { console: { error: (...args: unknown[]) => logs.push(args) } })
    return { report, queries, logs }
}

test('admin statistics link only eligible receipts using one owner-scoped batch, including off-page deductions', async () => {
    const h = harness()
    const result = await h.report('owner', page, { includeReceiptAvailability: true })
    assert.ok(result)
    const ops = result.recentOperations
    assert.equal(ops.find(row => row.id === 'visible')?.receiptAvailable, true)
    for (const id of ['legacy', 'failed', 'review', 'incomplete']) {
        assert.equal(ops.find(row => row.id === id)?.receiptAvailable, false, id)
    }
    assert.equal(result.recentTransactions.find(row => row.operationId === 'off-page')?.receiptAvailable, true)
    assert.equal(result.recentTransactions.find(row => row.operationId === 'foreign')?.receiptAvailable, false)
    for (const row of result.recentTransactions.filter(row => row.type !== 'OPERATION_DEDUCT')) {
        assert.equal(row.receiptAvailable, false)
    }
    const batches = h.queries.filter(query => query.select.fulfillmentProof)
    assert.equal(batches.length, 1)
    assert.equal(batches[0].where.userId, 'owner')
    assert.equal(new Set(batches[0].where.id.in).size, batches[0].where.id.in.length)
    assert.ok(batches[0].where.id.in.includes('off-page'))
    const serialized = JSON.stringify(result)
    for (const secret of ['fulfillmentProof', 'PRIVATE-PROMO', 'PRIVATE-CARD', 'SYNTHETIC-INVOICE']) {
        assert.equal(serialized.includes(secret), false)
    }
})

test('default manager statistics neither query nor return receipt metadata', async () => {
    const h = harness()
    const result = await h.report('owner', page)
    assert.ok(result)
    assert.equal(h.queries.some(query => query.select.fulfillmentProof), false)
    assert.equal(JSON.stringify(result).includes('receiptAvailable'), false)
})

test('receipt availability failure rejects the read and logs a safe code, without raw database errors', async () => {
    const h = harness(true)
    await assert.rejects(h.report('owner', page, { includeReceiptAvailability: true }), /RECEIPT_AVAILABILITY_QUERY_FAILED/)
    assert.match(JSON.stringify(h.logs), /RECEIPT_AVAILABILITY_QUERY_FAILED/)
    assert.equal(JSON.stringify(h.logs).includes('PRIVATE-'), false)
})

test('only the admin stats endpoint opts in; manager, foreign user and anonymous access remain fenced', async () => {
    for (const scenario of [
        { endpoint: 'admin', role: 'ADMIN', owned: false, expected: 200 },
        { endpoint: 'admin', role: 'MANAGER', owned: true, expected: 403 },
        { endpoint: 'admin', role: null, owned: false, expected: 401 },
        { endpoint: 'manager', role: 'MANAGER', owned: true, expected: 200 },
        { endpoint: 'manager', role: 'MANAGER', owned: false, expected: 403 },
    ]) {
        const calls: unknown[][] = []
        const get = loadIsolatedModule<{ GET: (r: Request, a: { params: Promise<{ id: string }> }) => Promise<Response> }>(
            `src/app/api/${scenario.endpoint}/users/[id]/stats/route.ts`, {
                'next/server': { NextResponse: { json: Response.json.bind(Response) } },
                '@/lib/auth-utils': { requireRoleAPIWithMobile: async (_r: unknown, role: string) =>
                    !scenario.role ? { error: 'Unauthorized', status: 401 }
                        : role === 'ADMIN' && scenario.role !== role ? { error: 'Forbidden', status: 403 }
                            : { user: { id: 'viewer', role: scenario.role } } },
                '@/lib/prisma': { default: { user: { findUnique: async () => ({
                    role: 'USER', deletedAt: null, managerLink: scenario.owned ? [{ id: 'link' }] : [],
                }) } } },
                '@/lib/users/stats-report': { getUserStatsReport: async (...args: unknown[]) => {
                    calls.push(args); return { recentOperations: [] }
                } },
            }).GET
        const response = await get(new Request(`http://localhost/api/${scenario.endpoint}/users/owner/stats`), {
            params: Promise.resolve({ id: 'owner' }),
        })
        assert.equal(response.status, scenario.expected)
        assert.equal(calls.length, scenario.expected === 200 ? 1 : 0)
        if (calls.length) {
            assert.equal(calls[0][0], 'owner')
            assert.equal(JSON.stringify(calls[0][2]), scenario.endpoint === 'admin'
                ? JSON.stringify({ includeReceiptAvailability: true }) : undefined)
        }
    }
})
