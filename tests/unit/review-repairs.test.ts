import test from 'node:test'
import assert from 'node:assert/strict'
import { withRequestDeadline } from '../../src/lib/request-deadline'
import { validDecisionNote } from '../../shared/operations/review-decision-note'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { OperationStatus } from '@prisma/client'

test('network deadline releases a request even when transport ignores abort', async () => {
    let signal: AbortSignal | undefined
    await assert.rejects(withRequestDeadline(s => { signal = s; return new Promise(() => {}) }, 15), /REQUEST_TIMEOUT/)
    assert.equal(signal?.aborted, true)
})
test('network deadline covers stalled response body parsing', async () => {
    await assert.rejects(withRequestDeadline(async () => {
        const response = { json: () => new Promise(() => {}) }
        return response.json()
    }, 15), /REQUEST_TIMEOUT/)
})
test('network deadline cancels on unmount and preserves a completed response', async () => {
    const parent = new AbortController()
    const pending = withRequestDeadline(() => new Promise(() => {}), 1000, parent.signal)
    parent.abort(new Error('REQUEST_ABORTED'))
    await assert.rejects(pending, /REQUEST_ABORTED/)
    assert.equal(await withRequestDeadline(async () => 42, 1000), 42)
})
test('review note uses the same whitespace and 2000 character boundary as the API', () => {
    for (const value of ['', '  \n ', 'x'.repeat(2001)]) assert.equal(validDecisionNote(value), false)
    assert.equal(validDecisionNote('x'.repeat(2000)), true)
    assert.equal(validDecisionNote('  verified  '), true)
    assert.equal(validDecisionNote('', false), true)
    assert.equal(validDecisionNote('x'.repeat(2001), false), false)
})

for (const note of ['', '   ', 'x'.repeat(2001)]) {
    test(`actual review API rejects invalid note length ${note.length} before financial effects`, async () => {
        const path = 'src/app/api/admin/financial-review/[operationId]/decision/route.ts'
        const deps = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
        Object.assign(deps, {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } }, '@prisma/client': { OperationStatus },
            '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => ({ user: { id: 'synthetic' } }) },
            '../../../../../../../shared/operations/review-decision-note': { validDecisionNote },
        })
        const api = loadIsolatedModule<{ POST(req: Request, context: unknown): Promise<Response> }>(path, deps)
        const res = await api.POST(new Request('http://localhost/synthetic', { method: 'POST',
            body: JSON.stringify({ action: 'REFUND_CUSTOMER', note }) }), { params: Promise.resolve({ operationId: 'synthetic' }) })
        assert.equal(res.status, 400)
        assert.equal((await res.json()).code, 'INVALID_DECISION_NOTE')
    })
}
