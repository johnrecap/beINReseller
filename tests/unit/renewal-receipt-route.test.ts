import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init)

function route(role: string | null, userId: string, ownerId = 'owner') {
    let reads = 0
    const operation = {
        id: 'operation-one', userId: ownerId, type: 'RENEW', status: 'COMPLETED',
        responseData: { privateProviderCookie: 'secret' },
        fulfillmentAuthority: 'AUTOMATED_REPORT',
        fulfillmentProof: { proofKind: 'SOLD_REPORT_SAME_DAY', invoiceNo: 'invoice-one' },
        chargedBeinSpendLedger: null, beinAccount: { username: 'provider-secret' },
        transactions: [], refundSettlements: [],
    }
    const get = loadIsolatedModule<{ GET: (req: Request, args: { params: Promise<{ id: string }> }) => Promise<Response> }>(
        'src/app/api/operations/[id]/route.ts', {
            'next/server': { NextResponse: { json } },
            '@/lib/auth-utils': { getAuthenticatedUser: async () => role ? { id: userId, role } : null },
            '@/lib/prisma': { default: { operation: { findUnique: async () => { reads++; return operation } } } },
            '../../../../../shared/operations/consumer-progress': { projectOperationProgress: () => ({}) },
            '@/lib/operation-detail-audit': {
                buildChargedBeinAccountAudit: () => null,
                redactOperationResponseData: () => ({}),
            },
            '@/lib/operations/receipt': { projectRenewalReceipt: () => ({ beinInvoiceNo: 'invoice-one' }) },
        }).GET
    return { get, reads: () => reads }
}

const args = { params: Promise.resolve({ id: 'operation-one' }) }
const request = new Request('http://localhost/api/operations/operation-one')

test('anonymous cannot query a receipt and another user cannot view it', async () => {
    const anonymous = route(null, 'other')
    assert.equal((await anonymous.get(request, args)).status, 401)
    assert.equal(anonymous.reads(), 0)
    const other = route('USER', 'other')
    assert.equal((await other.get(request, args)).status, 403)
    // A manager's relationship to the owner never grants receipt access.
    const manager = route('MANAGER', 'owners-manager')
    assert.equal((await manager.get(request, args)).status, 403)
})

test('owner and admin can reopen the local receipt without raw provider evidence', async () => {
    for (const [role, id] of [['USER', 'owner'], ['ADMIN', 'admin']]) {
        const h = route(role, id)
        const result = await h.get(request, args)
        assert.equal(result.status, 200)
        const body = await result.json()
        assert.deepEqual(body.receipt, { beinInvoiceNo: 'invoice-one' })
        assert.equal('fulfillmentProof' in body, false)
        assert.equal('beinAccount' in body, false)
        assert.equal('privateProviderCookie' in body.responseData, false)
        assert.equal(h.reads(), 1)
    }
})
