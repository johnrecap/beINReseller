import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDispatch, loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { z } from 'zod'
import * as permissions from '../../src/lib/permissions'

test('watchdog considers preparation rows rather than only final confirmation', async () => {
    const queries: unknown[] = []
    const db = { operationDispatch: {
        updateMany: async () => ({ count: 0 }),
        findMany: async (query: unknown) => { queries.push(query); return [] },
    } }
    await loadDispatch(db).runDispatchWatchdog()
    assert.ok(queries.length >= 2)
    for (const query of queries) assert.equal((query as { where: { jobType?: string } }).where.jobType, undefined)
})

for (const limit of [undefined, NaN, Infinity, -10, 1.5, 999]) {
    test(`dispatch scans and stale-claim recovery cap their batches: ${String(limit)}`, async () => {
        const queries: Array<{ take: number }> = []
        const db = { operationDispatch: { findMany: async (query: { take: number }) => { queries.push(query); return [] } } }
        await loadDispatch(db).runDispatchWatchdog({ limit })
        assert.equal(queries.length, 3)
        for (const query of queries) assert.equal(query.take, Number.isFinite(limit)
            ? Math.max(1, Math.min(200, Math.floor(limit!))) : 50)
    })
}

for (const name of ['create', 'bulk']) {
    test(`unsupported card CHECK_BALANCE rejected before price, writes or dispatch: ${name}`, async () => {
        const path = `src/app/api/operations/${name}/route.ts`
        let effects = 0
        const unexpected = new Proxy({}, { get: () => () => { effects++; throw new Error('DOMAIN_EFFECT') } })
        const deps = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, unexpected]))
        Object.assign(deps, {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } }, zod: { z },
            '@/lib/auth-utils': { ...permissions, getAuthenticatedUser: async () => ({ id: 'synthetic', role: 'ADMIN' }) },
            '@/lib/permissions': permissions,
            '@/lib/rate-limiter': { withRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { operations: {} } },
        })
        const api = loadIsolatedModule<{ POST: (req: Request) => Promise<Response> }>(path, deps)
        const res = await api.POST(new Request('http://localhost/synthetic', { method: 'POST',
            body: JSON.stringify({ type: 'CHECK_BALANCE', cardNumber: '7100000001', cardNumbers: ['7100000001'] }) }))
        assert.equal(res.status, 400)
        assert.equal((await res.json()).code, 'UNSUPPORTED_OPERATION_TYPE')
        assert.equal(effects, 0)
    })
}
