import test from 'node:test'
import assert from 'node:assert/strict'
import * as readiness from '../../src/lib/renewal-readiness'
import { getRenewalReadiness } from '../../src/lib/renewal-readiness'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('T035 requested ENFORCE is blocked when attestation is missing even if fallback mode is REVIEW_ONLY', async () => {
    const db = { setting: { findMany: async () => [{ key: 'bein_renewal_fulfillment_proof_mode', value: 'ENFORCE' }] },
        beinAccount: { count: async () => 3 } }
    const result = await getRenewalReadiness(db as unknown as Parameters<typeof getRenewalReadiness>[0])
    assert.equal(result.ready, false)
    assert.equal(result.requestedMode, 'ENFORCE')
    assert.equal(result.effectiveMode, 'REVIEW_ONLY')
    assert.equal(result.reasonCode, 'LIVE_SMOKE_ATTESTATION_MISSING')
})

test('T036 actual installment confirmation rejects an unavailable owned account before any debit or dispatch', async () => {
    const path = 'src/app/api/operations/[id]/confirm-installment/route.ts'
    let writes = 0
    const forbidden = () => { writes++; throw new Error('UNEXPECTED_FINANCIAL_WRITE') }
    const operation = { id: 'operation', userId: 'owner', purpose: 'INSTALLMENT', status: 'AWAITING_FINAL_CONFIRM',
        cardNumber: '7100000001', beinAccountId: 'account', amount: 0, responseData: { installment: { dealerPrice: 174 } } }
    const db = { operation: { findUnique: async () => operation, findUniqueOrThrow: async () => operation, updateMany: forbidden },
        user: { update: forbidden }, transaction: { create: forbidden }, operationDispatch: { create: forbidden },
        setting: { findMany: async () => [] }, beinAccount: { count: async () => 0 },
        providerAccountCausalReservation: { findFirst: async () => null }, $queryRaw: async () => [],
        $transaction: async (run: (tx: unknown) => unknown) => run(db) }
    const dependencies = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(f => [f.fileName, {}]))
    Object.assign(dependencies, {
        'next/server': { NextResponse: { json: Response.json.bind(Response) } },
        '@/lib/auth-utils': { getAuthenticatedUser: async () => ({ id: 'owner', role: 'USER' }) },
        '@/lib/prisma': { default: db }, '@/lib/renewal-readiness': readiness,
        '@/lib/operation-safety': { parseOperationResponseData: (value: unknown) => value },
        '@/lib/operations/renewal-creation-guard': { ensureGuardedRenewalOperationReservation: async () => undefined },
        '@/lib/operation-dispatch': { createOperationDispatch: forbidden, dispatchPendingOperationJobs: forbidden },
    })
    const route = loadIsolatedModule<{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(path, dependencies)
    const response = await route.POST(new Request('http://localhost/synthetic', { method: 'POST' }), { params: Promise.resolve({ id: 'operation' }) })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).reasonCode, 'NO_ELIGIBLE_PROVIDER_ACCOUNT')
    assert.equal(writes, 0)
})
