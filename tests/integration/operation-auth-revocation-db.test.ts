import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { z } from 'zod'
import { Prisma, OperationStatus } from '@prisma/client'
import { lockFinancialOperation } from '../../shared/operations/financial-lock'
import { auditDatabaseSkipReason as skip, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as permissions from '../../src/lib/permissions'
import * as detailAudit from '../../src/lib/operation-detail-audit'
import * as listFilters from '../../src/lib/operation-list-filters'
import * as packageQuote from '../../shared/operations/package-quote'
const { quoteData } = packageQuote

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>
const next = { NextResponse: { json: Response.json.bind(Response) } }
const request = () => new Request('http://localhost/api/operations')

// Real persisted users, central guard, middleware and handlers; session transport
// is the only auth substitution. No credentials or external services are loaded.
for (const role of ['ADMIN', 'MANAGER', 'AGENT', 'USER'] as const) {
    test(`T027/T029 persisted ${role}: own read, foreign detail and collection isolation`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            const foreignId = f.marker + '-foreign'
            await f.db.user.create({ data: { id: foreignId, username: foreignId,
                email: foreignId + '@example.test', passwordHash: 'SYNTHETIC_NOT_A_CREDENTIAL', role } })
            try {
                await f.db.user.update({ where: { id: f.userId }, data: { role } })
                let actorId = f.userId
                // Deliberately stale ADMIN claims must never grant foreign access.
                const session = async () => ({ user: { id: actorId, role: 'ADMIN', passwordChangedAt: 0 } })
                const auth = loadIsolatedModule<{ getAuthenticatedUser: (r: Request) => Promise<unknown> }>(
                    'src/lib/auth-utils.ts', { './auth': { auth: session }, './permissions': permissions,
                        'next/navigation': {}, 'next/server': next, './prisma': { default: f.db },
                        './mobile-auth': { getMobileUserFromRequest: () => null } })
                const detail = loadIsolatedModule<{ GET: Handler }>('src/app/api/operations/[id]/route.ts', {
                    'next/server': next, '@/lib/auth-utils': auth, '@/lib/prisma': { default: f.db },
                    '@/lib/operation-detail-audit': detailAudit,
                })
                const context = { params: Promise.resolve({ id: f.operationId }) }
                assert.equal((await detail.GET(request(), context)).status, 200)
                actorId = foreignId
                assert.equal((await detail.GET(request(), context)).status, role === 'ADMIN' ? 200 : 403)

                const middlewarePath = 'src/lib/api-middleware.ts'
                const deps = Object.fromEntries(ts.preProcessFile(readFileSync(middlewarePath, 'utf8'))
                    .importedFiles.map(f => [f.fileName, {}]))
                Object.assign(deps, { 'next/server': next, '@/lib/auth-utils': { ...permissions, ...auth },
                    '@/lib/auth': { auth: session } })
                const middleware = loadIsolatedModule(middlewarePath, deps)
                const collection = loadIsolatedModule<{ GET: Handler }>('src/app/api/operations/route.ts', {
                    'next/server': next, '@/lib/api-middleware': middleware, '@/lib/prisma': { default: f.db },
                    '@/lib/operation-list-filters': listFilters,
                    '@/lib/operation-safety': { parseOperationResponseData: quoteData },
                    '@/lib/operations/recovery': { recoverOperationIfNeeded: () => { throw new Error('READ_MUTATED') } },
                })
                const response = await collection.GET(request(), context)
                assert.equal(response.status, 200)
                assert.equal((await response.json()).total, 0, 'ADMIN collection also remains owner-scoped')
                actorId = f.userId
                assert.equal((await (await collection.GET(request(), context)).json()).total, 1)
                assert.equal(await f.db.operationDispatch.count({ where: { operationId: f.operationId } }), 0)
                assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 1)

                actorId = foreignId
                const exceptionMethods = new Set(['packages:GET', 'installment:GET', 'confirm-installment:POST'])
                const routes = ['apply-promo:POST', 'cancel:POST', 'cancel-confirm:POST', 'captcha:GET', 'captcha:POST',
                    'confirm-installment:POST', 'confirm-purchase:POST', 'heartbeat:GET', 'heartbeat:POST',
                    'installment:GET', 'packages:GET', 'select-package:POST']
                for (const entry of routes) {
                    const [name, method] = entry.split(':')
                    const path = `src/app/api/operations/[id]/${name}/route.ts`
                    let effects = 0
                    const unexpected = new Proxy({}, { get: () => () => { effects++; throw new Error('UNEXPECTED_DOMAIN_EFFECT') } })
                    const routeDeps = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles
                        .map(file => [file.fileName, unexpected]))
                    Object.assign(routeDeps, {
                        'next/server': next, '@prisma/client': { Prisma, OperationStatus }, zod: { z },
                        '@/lib/auth-utils': auth, '@/lib/prisma': { default: f.db },
                        '@/lib/renewal-readiness': { renewalReadinessErrorPayload: () => null },
                        '@/lib/customer-auth': { getCustomerFromRequest: () => null },
                        '@/lib/rate-limiter': { withRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { financial: {} } },
                        '@/lib/operation-safety': { parseOperationResponseData: quoteData },
                        '@/lib/operations/renewal-creation-guard': { isRenewalCreationBlockedError: () => false },
                        '../../../../../../shared/operations/financial-lock': { lockFinancialOperation },
                        '../../../../../../shared/operations/package-quote': packageQuote,
                    })
                    const handler = loadIsolatedModule<Record<string, Handler>>(path, routeDeps)
                    const response = await handler[method](new Request('http://localhost/synthetic', { method,
                        ...(method === 'POST' ? { body: JSON.stringify({ packageIndex: 0, quoteRevision: 0,
                            actionRevision: 1, promoCode: 'CODE', code: '123456', captcha: '123456' }) } : {}) }), context)
                    const expected = name === 'heartbeat' ? 404 : role === 'ADMIN' && exceptionMethods.has(entry)
                        ? name === 'confirm-installment' ? 400 : 200 : 403
                    assert.equal(response.status, expected, `${role} ${entry}`)
                    assert.equal(effects, 0, `${entry} must not invoke domain work before denying ownership`)
                }
                assert.equal(await f.db.operationDispatch.count({ where: { operationId: f.operationId } }), 0)
                assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 1)
            } finally { await f.db.user.delete({ where: { id: foreignId } }) }
        })
    })
}

for (const state of ['disabled', 'deleted', 'password-reset', 'missing', 'demoted', 'valid'] as const) {
    test(`T027 persisted session revocation: ${state}`, { skip }, async () => {
        await withAuditOperationFixture('reseller', async f => {
            await f.db.user.update({ where: { id: f.userId }, data: {
                isActive: state !== 'disabled', deletedAt: state === 'deleted' ? f.now : null,
                passwordChangedAt: new Date(state === 'password-reset' ? 2000 : 1000),
                role: state === 'demoted' ? 'USER' : 'ADMIN',
            } })
            const auth = loadIsolatedModule<{ getAuthenticatedUser(r: Request): Promise<{ role: string } | null> }>(
                'src/lib/auth-utils.ts', { './auth': { auth: async () => ({ user: {
                    id: state === 'missing' ? f.marker + '-absent' : f.userId,
                    role: 'ADMIN', passwordChangedAt: 1000,
                } }) }, './permissions': permissions, 'next/navigation': {}, 'next/server': next,
                    './prisma': { default: f.db }, './mobile-auth': { getMobileUserFromRequest: () => null } })
            const actual = await auth.getAuthenticatedUser(request())
            if (state === 'valid' || state === 'demoted') assert.equal(actual?.role, state === 'valid' ? 'ADMIN' : 'USER')
            else assert.equal(actual, null)
            assert.equal(await f.db.operationDispatch.count({ where: { operationId: f.operationId } }), 0)
            assert.equal(await f.db.transaction.count({ where: { operationId: f.operationId } }), 1)
        })
    })
}
