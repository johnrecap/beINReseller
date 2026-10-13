import { seedHistoricalCardRelease } from '../../tests/helpers/historical-card-release'
import test from 'node:test'
import assert from 'node:assert/strict'
import axios, { type AxiosAdapter, type AxiosInstance } from 'axios'
import * as cheerio from 'cheerio'
import { readFileSync } from 'node:fs'
import { openPglitePrisma } from '../../tests/helpers/pglite-prisma'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import { completeCardRelease, beginOperationProviderRequest, finishOperationProviderRequest } from '../../shared/operations/admin-card-release'
import type { HttpClientService } from '../src/http/HttpClientService'

test('actual HTTP interceptors survive session import/reset, retain a late success observation and prevent another provider call', async () => {
    const f = await openPglitePrisma()
    try {
        await f.engine.exec(readFileSync('prisma/migrations/20261013190000_admin_card_release/migration.sql', 'utf8').split('-- EXECUTION_FENCES:')[1].replace(/^.*\n/, ''))
        const admin = await f.db.user.create({ data: { username: 'http-admin', email: 'http@example.test', passwordHash: 'test', role: 'ADMIN', balance: 10 } })
        const op = await f.db.operation.create({ data: { id: 'http-attempt', type: 'RENEW', cardNumber: '7000000066', amount: 0, userId: admin.id, status: 'COMPLETING' } })
        let respond!: () => void, entered!: () => void, calls = 0
        const enteredAdapter = new Promise<void>(resolve => { entered = resolve })
        const responseGate = new Promise<void>(resolve => { respond = resolve })
        const adapter: AxiosAdapter = async config => {
            calls++; entered(); await responseGate
            return { data: '<html><body>Contract Created Successfully</body></html>', status: 200, statusText: 'OK', headers: {}, config }
        }
        const dependencies: Record<string, unknown> = { cheerio }
        for (const name of ['axios', 'axios-retry', 'axios-cookiejar-support', 'tough-cookie', 'https', '../lib/prisma',
            '../utils/totp-generator', '../utils/proxy-manager', 'http-cookie-agent/http', 'socks-proxy-agent', 'https-proxy-agent',
            './renewal-purchase-guard', './webforms-form', './sold-packages-report', '../../../shared/operations/package-quote',
            '../../../shared/operations/renewal-fulfillment-config']) dependencies[name] = {}
        dependencies.axios = { default: { create: (config: object) => axios.create({ ...config, adapter }) } }
        dependencies['axios-retry'] = { default: () => {} }
        dependencies['axios-cookiejar-support'] = { wrapper: (instance: unknown) => instance }
        class Jar { static async deserialize() { return new Jar() } }
        dependencies['tough-cookie'] = { CookieJar: Jar }
        const prototype = loadIsolatedModule<{ HttpClientService: { prototype: object } }>('worker/src/http/HttpClientService.ts', dependencies).HttpClientService.prototype
        const client = Object.assign(Object.create(prototype), { axios: axios.create({ adapter }), accountId: 'synthetic-account', jar: new Jar(),
            proxyConfig: null, config: { sessionTimeout: 20 } }) as HttpClientService
        client.setOperationRequestScope({ begin: method => beginOperationProviderRequest(f.db, op.id, method),
            finish: (id, result) => finishOperationProviderRequest(f.db, id, result) })
        await client.importSession({ accountId: 'synthetic-account', cookies: '{"cookies":[]}', expiresAt: Date.now() + 60000 })
        const runtime = client as unknown as { axios: AxiosInstance }
        const post = runtime.axios.post('https://provider.invalid/renew', 'synthetic=only')
        await enteredAdapter
        const release = await seedHistoricalCardRelease(f.db, { operationIds: [op.id], actorId: admin.id, note: 'Stop an in-flight synthetic request',
            decisionKey: 'synthetic-http-release' })
        assert.equal((await completeCardRelease(f.db, release.id)).state, 'DRAINING')
        respond()
        await assert.rejects(post, /ADMIN_OPERATION_STOPPED/)
        assert.equal((await completeCardRelease(f.db, release.id)).state, 'COMPLETED')
        const observed = await f.db.operationProviderRequest.findFirstOrThrow({ where: { operationId: op.id } })
        assert.equal(observed.resultCode, 'HTTP_200:EXPLICIT_SALE_SUCCESS')
        assert.equal(observed.observedAfterStop, true)
        client.resetSession()
        await assert.rejects(runtime.axios.post('https://provider.invalid/renew', 'synthetic=only'), /ADMIN_OPERATION_STOPPED/)
        assert.equal(calls, 1)
        assert.equal(await f.db.transaction.count(), 0)
        assert.equal(await f.db.operationFulfillmentProof.count(), 0)
    } finally { await f.close() }
})
