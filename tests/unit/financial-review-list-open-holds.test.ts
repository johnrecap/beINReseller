import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

test('admin review list does not age out open card-blocking operations', async () => {
    let where: Record<string, unknown> = {}
    const prisma = {
        operation: { findMany: async (query: { where: Record<string, unknown> }) => {
            where = query.where
            return []
        } },
    }
    const { GET } = loadIsolatedModule<{ GET: (request: Request) => Promise<Response> }>(
        'src/app/api/admin/financial-review/route.ts', {
            'next/server': { NextResponse: { json: Response.json } },
            '@prisma/client': { OperationStatus: { REVIEW_REQUIRED: 'REVIEW_REQUIRED' } },
            '@/lib/prisma': { default: prisma },
            '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => ({ user: { id: 'admin' } }) },
            '@/lib/financial-review/evidence': { buildFinancialReviewItem: () => null },
            '@/lib/financial-review/capabilities': { classifyFinancialReview: () => ({}), reviewCapabilitySelect: {} },
        },
    )
    const response = await GET(new Request('https://panel.invalid/api/admin/financial-review?days=90&q=7000000001'))
    assert.equal(response.status, 200)
    assert.ok(Object.keys(where).length > 0)
    const branches = where.OR as Array<Record<string, unknown>>
    assert.equal(JSON.stringify(branches[0]), JSON.stringify({ status: 'REVIEW_REQUIRED' }))
    assert.ok(branches.some(branch => JSON.stringify(branch).includes('updatedAt')))
    assert.ok(branches.some(branch => JSON.stringify(branch).includes('integrityIssues')))
    assert.ok(branches.some(branch => JSON.stringify(branch).includes('cardLifecycleReservation')))
    assert.equal(Object.hasOwn(where, 'updatedAt'), false)
    assert.ok(JSON.stringify(where.AND).includes('7000000001'))
})
