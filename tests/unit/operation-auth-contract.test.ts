import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { z } from 'zod'
import { Prisma, OperationStatus } from '@prisma/client'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as permissions from '../../src/lib/permissions'
import jwt from 'jsonwebtoken'

const staleUser = { id: 'synthetic-user', role: 'ADMIN', username: 'synthetic', balance: 100, passwordChangedAt: 1000 }
const next = { NextResponse: { json: Response.json.bind(Response) } }
type Handler = (req: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>

test('customer JWT using the fallback shared secret cannot become a panel identity or query with an absent ID', async () => {
    const secret = 'SYNTHETIC_TEST_SECRET_ONLY'
    const mobile = loadIsolatedModule<{ verifyMobileToken(token: string): { id: string; tokenIssuedAt: number } }>(
        'src/lib/mobile-auth.ts', { jsonwebtoken: { default: jwt }, 'next/server': next }, [], { NEXTAUTH_SECRET: secret })
    const panelToken = jwt.sign({ id: 'panel-user', role: 'USER', iat: 1000 }, secret)
    assert.equal(mobile.verifyMobileToken(panelToken).id, 'panel-user')
    assert.equal(mobile.verifyMobileToken(panelToken).tokenIssuedAt, 1000000)
    let lookups = 0
    const auth = loadIsolatedModule<{ getAuthenticatedUser(req: Request): Promise<unknown> }>('src/lib/auth-utils.ts', {
        './auth': { auth: async () => null }, './permissions': permissions, 'next/navigation': {}, 'next/server': next,
        './mobile-auth': mobile, './prisma': { default: { user: { findUnique: async () => { lookups++; throw new Error('INVALID_PANEL_LOOKUP') } } } },
    })
    const token = jwt.sign({ customerId: 'synthetic-user', type: 'access', email: 'synthetic@example.test' }, secret)
    assert.equal(await auth.getAuthenticatedUser(new Request('http://localhost/synthetic', {
        headers: { Authorization: `Bearer ${token}` },
    })), null)
    assert.equal(lookups, 0)
})

test('operation collection opts into actual middleware current-user validation', async () => {
    const path = 'src/lib/api-middleware.ts'
    const deps: Record<string, unknown> = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    Object.assign(deps, {
        'next/server': next,
        '@/lib/auth-utils': { ...permissions, getAuthenticatedUser: async () => null },
        '@/lib/auth': { auth: async () => ({ user: staleUser }) },
        '@/lib/api-response': { ERROR_MESSAGES: { UNAUTHORIZED: 'Unauthorized' },
            errorResponse: (error: string, status: number) => Response.json({ error }, { status }) },
    })
    const middleware = loadIsolatedModule<{ withAuth: unknown }>(path, deps)
    const route = 'src/app/api/operations/route.ts'
    const routeDeps = Object.fromEntries(ts.preProcessFile(readFileSync(route, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    Object.assign(routeDeps, { 'next/server': next, '@/lib/api-middleware': middleware })
    const api = loadIsolatedModule<{ GET: Handler }>(route, routeDeps)
    const res = await api.GET(new Request('http://localhost/synthetic'), { params: Promise.resolve({ id: '' }) })
    assert.equal(res.status, 401)
})

// Import substitutions are explicit and never initialize auth/database/queues.
// The real route must consult the central guard before any domain dependency.
for (const relative of readdirSync('src/app/api/operations', { recursive: true }) as string[]) {
    if (!relative.endsWith('route.ts') || relative === 'route.ts') continue
    const path = 'src/app/api/operations/' + relative.replaceAll('\\', '/')
    for (const method of ['GET', 'POST'] as const) {
        const source = readFileSync(path, 'utf8')
        if (!source.includes(`export async function ${method}(`)) continue
        test(`current-user denial before domain effects: ${method} ${relative}`, async () => {
            let effects = 0
            const unexpected = new Proxy({}, { get: () => () => { effects++; throw new Error('UNEXPECTED_DOMAIN_EFFECT') } })
            const deps: Record<string, unknown> = Object.fromEntries(
                ts.preProcessFile(source).importedFiles.map(f => [f.fileName, unexpected]))
            Object.assign(deps, {
                'next/server': next, zod: { z }, '@prisma/client': { Prisma, OperationStatus },
                '@/lib/auth': { auth: async () => ({ user: staleUser }) },
                '@/lib/auth-utils': { ...permissions, getAuthenticatedUser: async () => null },
                '@/lib/mobile-auth': { getMobileUserFromRequest: () => null },
                '@/lib/customer-auth': { getCustomerFromRequest: () => null },
                '@/lib/permissions': permissions,
            })
            const api = loadIsolatedModule<Record<string, Handler>>(path, deps)
            const response = await api[method](new Request('http://localhost/synthetic', { method }),
                { params: Promise.resolve({ id: 'synthetic-operation' }) })
            assert.equal(response.status, 401)
            assert.equal(effects, 0)
        })
    }
}

for (const kind of ['disabled', 'deleted', 'reset', 'missing', 'demoted', 'valid'] as const) {
    test(`actual central auth guard validates ${kind} persisted actor`, async () => {
        const dbUser = { ...staleUser, isActive: kind !== 'disabled', deletedAt: kind === 'deleted' ? new Date() : null,
            passwordChangedAt: kind === 'reset' ? new Date(2000) : new Date(1000), role: kind === 'demoted' ? 'USER' : 'ADMIN' }
        const api = loadIsolatedModule<{ getAuthenticatedUser(req: Request): Promise<typeof dbUser | null> }>('src/lib/auth-utils.ts', {
            './auth': { auth: async () => ({ user: staleUser }) }, './permissions': permissions,
            'next/navigation': {}, 'next/server': next, './mobile-auth': { getMobileUserFromRequest: () => null },
            './prisma': { default: { user: { findUnique: async () => kind === 'missing' ? null : dbUser } } },
        })
        const actual = await api.getAuthenticatedUser(new Request('http://localhost/synthetic'))
        if (kind === 'demoted' || kind === 'valid') assert.equal(actual?.role, dbUser.role)
        else assert.equal(actual, null)
    })
}
