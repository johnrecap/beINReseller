import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

type Handler = (request: Request, context: { params: Promise<{ operationId: string }> }) => Promise<Response>
function harness(role: string | null = 'ADMIN', failure?: unknown) {
    const reads: string[] = []
    const dependencies = {
        'next/server': { NextResponse: { json: Response.json } },
        '@prisma/client': { OperationStatus: {} },
        '@/lib/prisma': { default: { $transaction: async () => { throw failure }, cardAdministrativeRelease: { findUnique: async () => {
            reads.push('progress'); return { id: 'release-one', state: 'DRAINING', lastError: null, completedAt: null, operations: [{ id: 'operation-one' }] }
        } } } },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async (_request: unknown, required: string) => {
            assert.equal(required, 'ADMIN')
            return !role ? { error: 'Unauthorized', status: 401 } : role !== 'ADMIN' ? { error: 'Forbidden', status: 403 } : { user: { id: 'admin' } }
        } },
        '@/lib/financial-review/evidence': {}, '@/lib/financial-review/manual-decisions': {},
        '@/lib/points/operation-spend-award-runs': {}, '@/lib/operations/manual-fulfillment-finalization': {},
        '@/lib/operations/financial-review-refund-finalization': {},
        '../../../../../../../shared/db/ownership-evidence-lock': {},
        '../../../../../../../shared/operations/review-decision-note': { validDecisionNote: (note: string) => Boolean(note.trim()) },
        '@/lib/financial-review/capabilities': {}, '@/lib/operations/legacy-review-finalization': {},
        '@/lib/operations/pre-mutation-renewal-finalization': {}, '@/lib/redis': { default: {} },
    }
    const get = loadIsolatedModule<{ GET: (request: Request) => Promise<Response> }>(
        'src/app/api/admin/financial-review/card-release/route.ts', dependencies).GET
    const post = loadIsolatedModule<{ POST: Handler }>(
        'src/app/api/admin/financial-review/[operationId]/decision/route.ts', dependencies).POST
    return { get, post, reads }
}
for (const role of [null, 'USER', 'AGENT', 'MANAGER']) test(`administrative preview and decision reject ${role || 'anonymous'} before storage`, async () => {
    const h = harness(role)
    const expected = role ? 403 : 401
    assert.equal((await h.get(new Request('https://panel.invalid/release?releaseId=release-one'))).status, expected)
    const response = await h.post(new Request('https://panel.invalid/decision', { method: 'POST', body: JSON.stringify({
        action: 'ADMIN_ARCHIVE_AND_UNLOCK_CARD', note: 'synthetic decision', acknowledgeRisk: true,
    }) }), { params: Promise.resolve({ operationId: 'operation-one' }) })
    assert.equal(response.status, expected)
    assert.deepEqual(h.reads, [])
})

test('retired unlock creation is rejected for an admin without accessing storage', async () => {
    const h = harness()
    const response = await h.post(new Request('https://panel.invalid/decision', { method: 'POST', body: JSON.stringify({
        action: 'ADMIN_ARCHIVE_AND_UNLOCK_CARD', note: 'Synthetic reason', decisionKey: 'retired',
    }) }), { params: Promise.resolve({ operationId: 'synthetic-operation' }) })
    assert.equal(response.status, 400)
    assert.deepEqual(h.reads, [])
})
test('administrative progress polling is read-only and contains no card or provider data', async () => {
    const h = harness()
    const response = await h.get(new Request('https://panel.invalid/release?releaseId=release-one'))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: 'release-one', state: 'DRAINING', lastError: null, completedAt: null, operationIds: ['operation-one'] })
    assert.deepEqual(h.reads, ['progress'])
    assert.equal((await h.get(new Request('https://panel.invalid/release?cardNumber=invalid'))).status, 404)
    assert.deepEqual(h.reads, ['progress'])
})
