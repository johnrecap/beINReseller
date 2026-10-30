import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { OperationStatus, Prisma } from '@prisma/client'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as routes from '../src/lib/bein-connection-mode'
import * as verificationRetry from '../src/lib/renewal-verification-retry'

for (const version of [1, 2]) test(`deferred verification v${version} selects current direct route without touching purchase evidence`, async () => {
    const path = 'worker/src/http-queue-processor.ts'
    const deps: Record<string, any> = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    const account = { id: 'account-a', username: 'synthetic', isActive: true, automationExclusive: true,
        proxyId: 'old-proxy', proxy: { id: 'old-proxy', host: '127.0.0.1', port: 9, username: 'synthetic', password: 'private' } }
    const route = routes.resolveBeinRoute(account as any, { mode: 'assigned_proxy', operationId: 'op' })
    const responseData = { beinRoute: routes.buildOperationRouteSnapshot(route), sessionData: { cookies: 'purchase-private' } }
    const before = JSON.stringify(responseData)
    const operation = { id: 'op', beinAccountId: account.id, status: 'REVIEW_REQUIRED', renewalFlowVersion: version, responseData,
        providerAccountCausalReservation: { releasedAt: new Date(), reservationGeneration: 2 } }
    const tx = { $queryRaw: async () => [], operation: { findUnique: async () => operation } }
    const clients: unknown[] = []
    let releases = 0
    Object.assign(deps, {
        '@prisma/client': { Prisma, OperationStatus }, 'node:crypto': { randomUUID: () => 'lease' },
        './lib/prisma': { prisma: { operation: tx.operation, beinAccount: { findUnique: async () => account },
            setting: { findUnique: async () => ({ value: 'server_ip' }) }, $transaction: async (run: any) => run(tx) } },
        './lib/crypto': { decryptAccountPassword: (value: unknown) => value },
        './lib/bein-connection-mode': routes,
        './lib/renewal-verification-retry': verificationRetry,
        './lib/provider-account-reservation': { findActiveProviderAccountReservationForAccount: async () => null },
        './pool/account-locking': { acquireAccountExecutionLease: async () => ({ accountId: account.id, operationId: 'op', reservationGeneration: 2 }),
            assertAccountExecutionLease: async () => true },
        './http': { HttpClientService: class {
            constructor(proxy: unknown, id: string) { clients.push({ proxy, id }) }
            async initialize() { throw new Error('STOP_AT_HTTP_BOUNDARY') }
        } },
    })
    // Preserve the real handler/resolver/reservation code; stop before any provider or financial action.
    for (const name of Object.keys(deps)) if (name.includes('fulfillment-baseline') || name.includes('renewal-fulfillment')) {
        deps[name] = { ...deps[name], getActiveRenewalFulfillmentBaseline: async () => ({
            activeBaseline: { supersededAt: null }, verification: { attemptCount: 0 } }),
            persistRenewalFulfillmentState: async () => {}, recordFulfillmentVerificationAttempt: async () => ({}) }
    }
    const api = loadIsolatedModule<any>(path, deps, ['handleVerifyRenewalFulfillmentHttp'], {}, {
        setInterval: () => ({ unref() {} }), clearInterval: () => {},
    })
    const pool = { getRedis: () => ({}), getWorkerId: () => 'worker', releaseExecutionLease: async () => { releases++ } }
    await assert.rejects(api.handleVerifyRenewalFulfillmentHttp('op', pool), /STOP_AT_HTTP_BOUNDARY/)
    assert.equal(clients.length, 1, 'actual verification handler must reach HTTP boundary')
    assert.equal((clients[0] as any).proxy, undefined)
    assert.equal((clients[0] as any).id, account.id)
    assert.equal(JSON.stringify(responseData), before)
    assert.equal(releases, 1)
})
