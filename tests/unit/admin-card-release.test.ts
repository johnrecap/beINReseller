import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyFinancialReview } from '../../src/lib/financial-review/capabilities'
import { readFileSync } from 'node:fs'
import { openPglitePrisma } from '../helpers/pglite-prisma'
import { cardReleasePreview, requestCardRelease, completeCardRelease, beginOperationProviderRequest, finishOperationProviderRequest, resumeCardReleases } from '../../shared/operations/admin-card-release'
import { loadIsolatedModule, loadPanelPackages } from '../helpers/promo-dispatch-harness'
import * as reservations from '../../src/lib/operations/card-lifecycle-reservation'
import * as cooldown from '../../src/lib/operations/renewal-card-cooldown'
import * as quote from '../../shared/operations/package-quote'
import { projectOperationProgress } from '../../shared/operations/consumer-progress'
import { z } from 'zod'

const guard = loadIsolatedModule<typeof import('../../src/lib/operations/renewal-creation-guard')>('src/lib/operations/renewal-creation-guard.ts', {
    '@/lib/operations/card-lifecycle-reservation': reservations, './renewal-card-cooldown': cooldown,
    '../../../shared/operations/package-quote': quote,
})

test('admin can archive and unlock a historical zero-debit unknown review despite conflicting evidence', () => {
    const capabilities = classifyFinancialReview({ id: 'historical', type: 'RENEW', status: 'REVIEW_REQUIRED',
        userId: 'user', customerId: null, beinAccountId: 'account', cardNumber: '7000000001', amount: 0,
        providerPaymentState: 'UNKNOWN', transactions: [] })
    assert.ok(capabilities.allowedActions.map(String).includes('ADMIN_ARCHIVE_AND_UNLOCK_CARD'))
})

test('archived waiting attempt exposes a neutral result without obsolete packages or device data', async () => {
    const operation = { id: 'archived', userId: 'owner', status: 'AWAITING_PACKAGE',
        administrativeStopRequestedAt: new Date(), administrativeArchivedAt: new Date(),
        availablePackages: [{ name: 'old quote' }], stbNumber: 'private-device', responseData: {} }
    const api = loadPanelPackages(operation, 'owner')
    const response = await api.GET(new Request('https://panel.invalid/packages'), { params: Promise.resolve({ id: operation.id }) })
    const body = await response.json()
    assert.equal(body.settlementState, 'ADMINISTRATIVELY_ARCHIVED')
    assert.equal(body.messageKey, 'operations.administrativelyArchived')
    assert.ok(body.administrativeArchivedAt)
    assert.equal('availablePackages' in body, false)
    assert.equal('stbNumber' in body, false)
    assert.equal(projectOperationProgress(operation).reviewRequired, false)
})

test('a successful invoiced attempt retains its receipt and money while its cooldown is waived and old jobs are stopped', async () => {
    const f = await openPglitePrisma()
    try {
        await f.engine.exec(readFileSync('prisma/migrations/20261013190000_admin_card_release/migration.sql', 'utf8').split('-- EXECUTION_FENCES:')[1].replace(/^.*\n/, ''))
        const admin = await f.db.user.create({ data: { username: 'invoice-admin', email: 'invoice@example.test', passwordHash: 'test', role: 'ADMIN', balance: 10 } })
        const account = await f.db.beinAccount.create({ data: { username: 'invoice-account', password: 'test' } })
        const op = await f.db.operation.create({ data: { id: 'completed-with-invoice', type: 'RENEW', cardNumber: '7000000009',
            status: 'COMPLETED', userId: admin.id, beinAccountId: account.id, amount: 27 } })
        const claim = await f.db.providerInvoiceClaim.create({ data: { operationId: op.id, beinAccountId: account.id, invoiceNo: 'receipt-one', claimKind: 'SOLD_REPORT_SAME_DAY' } })
        await f.db.operationFulfillmentProof.create({ data: { operationId: op.id, beinAccountId: account.id, invoiceClaimId: claim.id,
            invoiceNo: claim.invoiceNo, cardNumberSnapshot: op.cardNumber, verificationSource: 'SYNTHETIC', providerCheckedAt: new Date() } })
        const before = await f.db.operationFulfillmentProof.findUniqueOrThrow({ where: { operationId: op.id } })
        const preview = await cardReleasePreview(f.db, op.cardNumber)
        assert.equal(preview.operations.length, 1)
        const input = { operationId: op.id, actorId: admin.id, note: 'Waive only this existing cooldown', decisionKey: 'invoice-request-one', fingerprint: preview.fingerprint, acknowledgeRisk: true }
        await f.db.user.update({ where: { id: admin.id }, data: { role: 'MANAGER' } })
        await assert.rejects(requestCardRelease(f.db, input), /ADMIN_REQUIRED/)
        await f.db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
        const release = await requestCardRelease(f.db, input)
        await completeCardRelease(f.db, release.id)
        const after = await f.db.operation.findUniqueOrThrow({ where: { id: op.id } })
        assert.equal(after.status, 'COMPLETED')
        assert.equal(after.amount, 27)
        assert.ok(after.administrativeStopRequestedAt)
        assert.equal(after.renewalCooldownUntil?.getTime(), op.renewalCooldownUntil?.getTime())
        assert.deepEqual(await f.db.operationFulfillmentProof.findUniqueOrThrow({ where: { operationId: op.id } }), before)
        await assert.rejects(beginOperationProviderRequest(f.db, op.id, 'POST'), /ADMIN_OPERATION_STOPPED/)
        assert.equal(await f.db.transaction.count(), 0)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: admin.id } })).balance, 10)
    } finally { await f.close() }
})

test('expired HTTP receipt resumes after restart and lock cleanup retries only the captured operation scope', async () => {
    const f = await openPglitePrisma()
    try {
        const admin = await f.db.user.create({ data: { username: 'restart-admin', email: 'restart@example.test', passwordHash: 'test', role: 'ADMIN' } })
        const account = await f.db.beinAccount.create({ data: { username: 'restart-account', password: 'test' } })
        const op = await f.db.operation.create({ data: { id: 'restart-attempt', type: 'RENEW', cardNumber: '7000000007', status: 'PROCESSING', amount: 0, beinAccountId: account.id } })
        const receipt = await beginOperationProviderRequest(f.db, op.id, 'POST')
        const preview = await cardReleasePreview(f.db, op.cardNumber)
        const release = await requestCardRelease(f.db, { operationId: op.id, actorId: admin.id, note: 'Resume saved administrative decision',
            decisionKey: 'restart-request-one', fingerprint: preview.fingerprint, acknowledgeRisk: true })
        await f.db.operationProviderRequest.update({ where: { id: receipt.id }, data: { deadlineAt: new Date(Date.now() - 1) } })
        const result = await completeCardRelease(f.db, release.id, { eval: async () => { throw new Error('private transport failure') } })
        assert.equal(result.state, 'COMPLETED')
        assert.equal(result.lastError, 'CARD_RELEASE_LOCK_CLEANUP_PENDING')
        const observed = await f.db.operationProviderRequest.findUniqueOrThrow({ where: { id: receipt.id } })
        assert.equal(observed.resultCode, 'DEADLINE_ELAPSED_RESULT_UNKNOWN')
        assert.equal(observed.observedAfterStop, true)
        let evaluations = 0
        await resumeCardReleases(f.db, 50, { eval: async (script, keyCount, ...args) => {
            evaluations++
            assert.equal(keyCount, 2)
            assert.deepEqual(args.slice(0, 2), [`bein:account:lock:${account.id}`, `bein:account:execution-lease:${account.id}`])
            assert.deepEqual(JSON.parse(String(args[2])), { [op.id]: true })
            assert.match(script, /scope\[owner.operationId\]/)
            return 1
        } })
        assert.equal(evaluations, 1)
        assert.equal((await f.db.cardAdministrativeRelease.findUniqueOrThrow({ where: { id: release.id } })).lastError, null)
    } finally { await f.close() }
})

test('migration upgrades the preceding structure without deleting a historical record or adding enum values', async () => {
    const f = await openPglitePrisma()
    try {
        await f.db.operation.create({ data: { id: 'migration-history', type: 'RENEW', cardNumber: '7000000008', status: 'REVIEW_REQUIRED', amount: 92 } })
        await f.engine.exec('DROP TABLE operation_provider_requests; ALTER TABLE operations DROP COLUMN administrative_release_id, DROP COLUMN administrative_archived_at, DROP COLUMN administrative_stop_requested_at; DROP TABLE card_administrative_releases;')
        const sql = readFileSync('prisma/migrations/20261013190000_admin_card_release/migration.sql', 'utf8')
        assert.doesNotMatch(sql, /ALTER TYPE/i)
        await f.engine.exec(sql)
        const op = await f.db.operation.findUniqueOrThrow({ where: { id: 'migration-history' } })
        assert.equal(op.amount, 92)
        assert.equal(op.administrativeStopRequestedAt, null)
        assert.equal(await f.db.cardAdministrativeRelease.count(), 0)
    } finally { await f.close() }
})

test('HTTP drain, late observation, stale preview, multiple attempts and replay retain all original money and unrelated holds', async () => {
    const f = await openPglitePrisma()
    try {
        await f.engine.exec(readFileSync('prisma/migrations/20261013190000_admin_card_release/migration.sql', 'utf8').split('-- EXECUTION_FENCES:')[1].replace(/^.*\n/, ''))
        const admin = await f.db.user.create({ data: { username: 'scope-admin', email: 'scope@example.test', passwordHash: 'test', role: 'ADMIN', balance: 8 } })
        const create = (id: string, cardNumber = '7000000002') => f.db.operation.create({ data: { id, type: 'RENEW',
            userId: admin.id, cardNumber, status: 'REVIEW_REQUIRED', amount: 92, providerPaymentState: 'UNKNOWN' } })
        const first = await create('first-paid-attempt')
        const second = await create('second-paid-attempt')
        const unrelated = await create('different-card', '7000000003')
        await f.db.transaction.createMany({ data: [first, second].flatMap(op => [
            { operationId: op.id, userId: admin.id, type: 'OPERATION_DEDUCT' as const, amount: -92, balanceAfter: 8 },
            { operationId: op.id, userId: admin.id, type: 'REFUND' as const, amount: 92, balanceAfter: 100 },
        ]) })
        await f.db.operationIntegrityIssue.createMany({ data: [first, second, unrelated].map(op => ({ operationId: op.id, issueType: 'DUPLICATE_RENEWAL_CHARGE_BURST' as const })) })
        const stale = await cardReleasePreview(f.db, first.cardNumber)
        await f.db.operation.update({ where: { id: second.id }, data: { responseMessage: 'SYNTHETIC_CHANGED_STAGE' } })
        const input = { operationId: first.id, actorId: admin.id, note: 'Retain original financial records and archive both attempts',
            decisionKey: 'synthetic-scope-request', fingerprint: stale.fingerprint, acknowledgeRisk: true }
        await assert.rejects(requestCardRelease(f.db, input), /CARD_RELEASE_PREVIEW_CHANGED/)
        assert.equal(await f.db.cardAdministrativeRelease.count(), 0)
        const request = await beginOperationProviderRequest(f.db, first.id, 'POST')
        const preview = await cardReleasePreview(f.db, first.cardNumber)
        assert.equal(preview.operations.length, 2)
        assert.deepEqual(preview.operations.map(op => [op.customerDeducted, op.customerRefunded]), [[92, 92], [92, 92]])
        const releases = await Promise.all([requestCardRelease(f.db, { ...input, fingerprint: preview.fingerprint }), requestCardRelease(f.db, { ...input, fingerprint: preview.fingerprint })])
        assert.equal(releases[0].id, releases[1].id)
        const releaseId = releases[0].id
        assert.equal((await completeCardRelease(f.db, releaseId)).state, 'DRAINING')
        await assert.rejects(f.db.$transaction(tx => guard.createGuardedRenewalOperation(tx, {
            cardNumber: first.cardNumber, data: { userId: admin.id, amount: 0, purpose: 'RENEWAL' },
        })), /ADMIN_RELEASE_IN_PROGRESS/)
        await assert.rejects(requestCardRelease(f.db, { ...input, fingerprint: preview.fingerprint, decisionKey: 'second-pending-request' }), /CARD_RELEASE_IN_PROGRESS/)
        await assert.rejects(beginOperationProviderRequest(f.db, first.id, 'POST'), /ADMIN_OPERATION_STOPPED/)
        await assert.rejects(finishOperationProviderRequest(f.db, request.id, 'HTTP_200'), /ADMIN_OPERATION_STOPPED/)
        const observation = await f.db.operationProviderRequest.findUniqueOrThrow({ where: { id: request.id } })
        assert.equal(observation.resultCode, 'HTTP_200')
        assert.equal(observation.observedAfterStop, true)
        // A new maintenance process can finish the saved request without any HTTP call.
        await resumeCardReleases(f.db)
        assert.equal((await f.db.cardAdministrativeRelease.findUniqueOrThrow({ where: { id: releaseId } })).state, 'COMPLETED')
        assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: unrelated.id } })).administrativeReleaseId, null)
        assert.equal(await f.db.operationIntegrityIssue.count({ where: { status: 'OPEN' } }), 3)
        assert.equal(await f.db.transaction.count(), 4)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: admin.id } })).balance, 8)
        assert.equal(await f.db.operationReviewAdjudication.count(), 2)
        await assert.rejects(requestCardRelease(f.db, { ...input, fingerprint: preview.fingerprint, note: 'changed payload' }), /CARD_RELEASE_KEY_CONFLICT/)
        assert.equal((await completeCardRelease(f.db, releaseId)).state, 'COMPLETED')
    } finally { await f.close() }
})

test('actual SQL administrative release preserves unknown finances and issues, waives cooldown and admits a new attempt', async () => {
    const f = await openPglitePrisma()
    try {
        await f.engine.exec(readFileSync('prisma/migrations/20261013190000_admin_card_release/migration.sql', 'utf8').split('-- EXECUTION_FENCES:')[1].replace(/^.*\n/, ''))
        const admin = await f.db.user.create({ data: { username: 'release-admin', email: 'admin@example.test', passwordHash: 'test', role: 'ADMIN', balance: 55 } })
        const account = await f.db.beinAccount.create({ data: { username: 'release-account', password: 'test' } })
        const op = await f.db.operation.create({ data: { id: 'unknown-review', type: 'RENEW', userId: admin.id, beinAccountId: account.id,
            cardNumber: '7000000001', amount: 0, status: 'REVIEW_REQUIRED', providerPaymentState: 'UNKNOWN' } })
        await f.db.operationIntegrityIssue.create({ data: { operationId: op.id, issueType: 'FULFILLMENT_PROOF_CONFLICT' } })
        await f.db.cardLifecycleReservation.create({ data: { operationId: op.id, cardNumber: op.cardNumber } })
        await f.db.providerAccountCausalReservation.create({ data: { operationId: op.id, beinAccountId: account.id, automaticWindowEndsAt: new Date() } })
        const preview = await cardReleasePreview(f.db, op.cardNumber)
        const input = { operationId: op.id, actorId: admin.id, note: 'Archive unknown result without financial settlement',
            decisionKey: 'synthetic-request-1', fingerprint: preview.fingerprint, acknowledgeRisk: true }
        const release = await requestCardRelease(f.db, input)
        assert.equal((await completeCardRelease(f.db, release.id)).state, 'COMPLETED')
        assert.equal((await requestCardRelease(f.db, input)).id, release.id)
        const after = await f.db.operation.findUniqueOrThrow({ where: { id: op.id } })
        assert.equal(after.status, 'REVIEW_REQUIRED')
        assert.equal(after.providerPaymentState, 'UNKNOWN')
        assert.equal(after.renewalCooldownUntil?.getTime(), op.renewalCooldownUntil?.getTime())
        assert.ok(after.administrativeArchivedAt)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: admin.id } })).balance, 55)
        assert.equal(await f.db.transaction.count(), 0)
        assert.equal(await f.db.operationIntegrityIssue.count({ where: { status: 'OPEN' } }), 1)
        assert.equal(await f.db.operationReviewAdjudication.count(), 1)
        assert.ok((await f.db.providerAccountCausalReservation.findUniqueOrThrow({ where: { operationId: op.id } })).releasedAt)
        const start = loadIsolatedModule<{ POST: (request: Request) => Promise<Response> }>('src/app/api/operations/start-renewal/route.ts', {
            'next/server': { NextResponse: { json: Response.json } },
            '@/lib/auth-utils': { getAuthenticatedUser: async () => ({ id: admin.id, role: 'ADMIN' }), roleHasPermission: () => true },
            '@/lib/prisma': { default: f.db }, zod: { z },
            '@/lib/operation-dispatch': { createOperationDispatch: async () => undefined, dispatchPendingOperationJobs: async () => ({ failed: 0 }) },
            '@/lib/rate-limiter': { withRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { operations: {} }, rateLimitHeaders: () => ({}) },
            '@/lib/permissions': { PERMISSIONS: { SUBSCRIPTION_RENEW: 'renew' } },
            '@/lib/redis': { default: { set: async () => 'OK', del: async () => 1 } },
            '@/lib/maintenance/effective-status': {},
            '@/lib/renewal-readiness': { assertRenewalReadiness: async () => undefined, renewalReadinessErrorPayload: () => null },
            '@/lib/operations/renewal-card-cooldown': cooldown,
            '@/lib/operations/renewal-creation-guard': guard,
        })
        const started = await start.POST(new Request('https://panel.invalid/api/operations/start-renewal', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardNumber: op.cardNumber, smartcardType: 'CISCO' }),
        }))
        assert.equal(started.status, 200, 'the actual HTTP entry must ignore only the completed archive')
        const next = await f.db.operation.findUniqueOrThrow({ where: { id: (await started.json()).operationId } })
        assert.equal(next.status, 'PENDING')
        await assert.rejects(f.db.$transaction(async tx => {
            await tx.user.update({ where: { id: admin.id }, data: { balance: { increment: 27 } } })
            await tx.transaction.create({ data: { operationId: op.id, userId: admin.id, type: 'REFUND', amount: 27, balanceAfter: 82 } })
        }), /ADMIN_OPERATION_STOPPED/)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: admin.id } })).balance, 55)
        await assert.rejects(f.db.operation.update({ where: { id: op.id }, data: { status: 'COMPLETED' } }), /ADMIN_OPERATION_STOPPED/)
    } finally { await f.close() }
})
