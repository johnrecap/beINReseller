import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma, OperationStatus } from '@prisma/client'
import { openPglitePrisma } from '../helpers/pglite-prisma'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as capabilities from '../../src/lib/financial-review/capabilities'
import * as reversals from '../../src/lib/points/reversals'
import * as decisions from '../../src/lib/financial-review/manual-decisions'
import * as evidence from '../../src/lib/financial-review/evidence'
import * as notes from '../../shared/operations/review-decision-note'
import * as quote from '../../shared/operations/package-quote'
import * as locks from '../../shared/operations/financial-lock'
import * as cardReservations from '../../src/lib/operations/card-lifecycle-reservation'
import * as cooldown from '../../src/lib/operations/renewal-card-cooldown'

test('actual SQL closure is atomic, preserves another operation and the original cooldown, and settles once', async () => {
    const f = await openPglitePrisma()
    try {
        const finalizer = loadIsolatedModule<typeof import('../../src/lib/operations/pre-mutation-renewal-finalization')>(
            'src/lib/operations/pre-mutation-renewal-finalization.ts', {
                '@prisma/client': { Prisma, OperationStatus }, '@/lib/prisma': { default: f.db },
                '@/lib/points/reversals': reversals, '@/lib/financial-review/capabilities': capabilities,
                '@/lib/financial-review/manual-decisions': decisions, '@/lib/financial-review/evidence': evidence,
                '../../../shared/operations/review-decision-note': notes,
                '../../../shared/operations/package-quote': quote, '../../../shared/operations/financial-lock': locks,
            })
        const user = await f.db.user.create({ data: { username: 'synthetic-hold-user', email: 'hold@example.test', passwordHash: 'test', balance: 73 } })
        const account = await f.db.beinAccount.create({ data: { username: 'synthetic-account', password: 'test' } })
        const create = (id: string, amount = 0) => f.db.operation.create({ data: { id, userId: user.id, beinAccountId: account.id,
            cardNumber: '7000000001', type: 'RENEW', purpose: 'RENEWAL', status: 'REVIEW_REQUIRED', amount,
            providerPaymentState: 'NOT_SUBMITTED', fulfillmentState: 'UNVERIFIED', fulfillmentAuthority: 'NONE',
            renewalFlowVersion: 2, responseData: { operationPhase: 'FINAL_CONFIRMATION_REQUESTED', finalPaySubmitted: false },
        } })
        const op = await create('synthetic-first', 27)
        const other = await create('synthetic-second')
        await f.db.transaction.create({ data: { userId: user.id, operationId: op.id, type: 'OPERATION_DEDUCT', amount: -27, balanceAfter: 73 } })
        await f.db.operationIntegrityIssue.createMany({ data: [op, other].map(row => ({ operationId: row.id, issueType: 'FULFILLMENT_PROOF_CONFLICT' })) })
        await f.db.cardLifecycleReservation.create({ data: { operationId: op.id, cardNumber: op.cardNumber } })
        await f.db.providerAccountCausalReservation.create({ data: { operationId: op.id, beinAccountId: account.id, automaticWindowEndsAt: new Date() } })
        const deadline = (await f.db.operation.findUniqueOrThrow({ where: { id: op.id } })).renewalCooldownUntil?.getTime()
        const input = { operationId: op.id, terminalStatus: 'FAILED' as const, allowedStatuses: ['REVIEW_REQUIRED' as const],
            responseMessage: 'PACKAGE_SELECTION_UNVERIFIED', releaseReason: 'SAFE_TERMINAL:SQL_TEST' }
        const results = await Promise.all([finalizer.finalizeWebPreMutationRenewalTermination(input), finalizer.finalizeWebPreMutationRenewalTermination(input)])
        assert.deepEqual(results.map(row => row.status).sort(), ['ALREADY_TERMINATED', 'TERMINATED'])
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: user.id } })).balance, 100)
        assert.equal(await f.db.transaction.count({ where: { operationId: op.id, type: 'REFUND' } }), 1)
        assert.equal(await f.db.operationIntegrityIssue.count({ where: { operationId: op.id, status: 'OPEN' } }), 0)
        assert.equal(await f.db.operationIntegrityIssue.count({ where: { operationId: other.id, status: 'OPEN' } }), 1)

        const guard = loadIsolatedModule<typeof import('../../src/lib/operations/renewal-creation-guard')>(
            'src/lib/operations/renewal-creation-guard.ts', {
                '@/lib/operations/card-lifecycle-reservation': cardReservations,
                './renewal-card-cooldown': cooldown, '../../../shared/operations/package-quote': quote,
            })
        await assert.rejects(f.db.$transaction(tx => guard.createGuardedRenewalOperation(tx, {
            cardNumber: op.cardNumber, data: { userId: user.id, amount: 0, purpose: 'RENEWAL' },
        })), (error: unknown) => guard.isRenewalCreationBlockedError(error) && error.reason === 'CARD_COOLDOWN')

        // Versioned new review, historical review, active owner and final-payment
        // ambiguity share the same actual maintenance query and finalizer.
        const newReview = await create('versioned-review')
        const busy = await create('versioned-busy')
        const submitted = await create('versioned-submitted')
        const cross = await create('versioned-duplicate')
        for (const row of [newReview, busy, submitted, cross]) await f.db.operation.update({ where: { id: row.id }, data: {
            responseData: JSON.stringify({ ...quote.quoteData(row.responseData), prePaymentClosurePolicyVersion: 1 }),
        } })
        await f.db.operation.update({ where: { id: submitted.id }, data: { providerMutationStage: 'FINAL_OK' } })
        await f.db.operationIntegrityIssue.create({ data: { operationId: cross.id, issueType: 'DUPLICATE_RENEWAL_CHARGE_BURST' } })
        // Give the busy operation its own account so the synthetic Redis owner
        // cannot inadvertently defer all four unrelated operations.
        const busyAccount = await f.db.beinAccount.create({ data: { username: 'synthetic-busy', password: 'test' } })
        await f.db.operation.update({ where: { id: busy.id }, data: { beinAccountId: busyAccount.id } })
        const maintenance = loadIsolatedModule<typeof import('../../src/lib/maintenance/renewal-hold-maintenance')>(
            'src/lib/maintenance/renewal-hold-maintenance.ts', {
                '@/lib/prisma': { default: f.db }, '@/lib/redis': { default: { exists: async (key: string) => key.includes(busyAccount.id) ? 1 : 0 } },
                '@/lib/operations/pre-mutation-renewal-finalization': finalizer, '@/lib/financial-review/capabilities': capabilities,
                '../../../shared/operations/package-quote': quote,
            })
        for (let i = 0; i < 9; i++) await maintenance.repairRenewalHolds({ limit: 1, now: new Date(Date.now() + 600_000) })
        assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: newReview.id } })).status, 'FAILED')
        for (const row of [other, busy, submitted, cross]) {
            assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: row.id } })).status, 'REVIEW_REQUIRED')
        }
        assert.equal(await f.db.transaction.count({ where: { type: 'REFUND' } }), 1)

        // An ended zero-debit row must still be discoverable if an issue remains.
        await f.db.operation.update({ where: { id: other.id }, data: { status: 'FAILED' } })
        const list = loadIsolatedModule<{ GET: (request: Request) => Promise<Response> }>(
            'src/app/api/admin/financial-review/route.ts', {
                'next/server': { NextResponse: { json: Response.json } }, '@prisma/client': { Prisma, OperationStatus },
                '@/lib/prisma': { default: f.db }, '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => ({ user: { id: user.id } }) },
                '@/lib/financial-review/evidence': evidence, '@/lib/financial-review/capabilities': capabilities,
            })
        const payload = await (await list.GET(new Request('https://panel.invalid/api/admin/financial-review?q=synthetic-second'))).json()
        assert.equal(payload.items.length, 1)
        assert.equal(payload.items[0].hold.blockReason, 'INTEGRITY_ISSUE')
        assert.ok(payload.items[0].capabilities.allowedActions.includes('RESOLVE_PRE_MUTATION'))

        const isolated = await f.db.operation.create({ data: {
            id: 'isolated-terminal', userId: user.id, type: 'RENEW', purpose: 'RENEWAL', status: 'FAILED',
            cardNumber: '7000000099', amount: 0, renewalFlowVersion: 2, providerPaymentState: 'NOT_SUBMITTED',
            fulfillmentState: 'UNVERIFIED', fulfillmentAuthority: 'NONE',
            responseData: { operationPhase: 'PACKAGE_PREPARATION', finalPaySubmitted: false },
        } })
        await f.db.operationIntegrityIssue.create({ data: { operationId: isolated.id, issueType: 'FULFILLMENT_PROOF_CONFLICT' } })
        await f.db.cardLifecycleReservation.create({ data: { operationId: isolated.id, cardNumber: isolated.cardNumber } })
        const admission = { cardNumber: isolated.cardNumber, data: { userId: user.id, amount: 0, purpose: 'RENEWAL' as const } }
        await assert.rejects(f.db.$transaction(tx => guard.createGuardedRenewalOperation(tx, admission)),
            (error: unknown) => guard.isRenewalCreationBlockedError(error) && error.reason === 'CARD_LIFECYCLE_RESERVED')
        const admin = await f.db.user.create({ data: { username: 'synthetic-admin', email: 'admin@example.test', passwordHash: 'test', role: 'ADMIN' } })
        const repair = { ...input, operationId: isolated.id, repairOnly: true, executionIdle: async () => true,
            adminReview: { actorId: admin.id, actorUsername: admin.username, note: 'Verified synthetic pre-payment evidence' } }
        assert.equal((await finalizer.finalizeWebPreMutationRenewalTermination(repair)).status, 'ALREADY_TERMINATED')
        const audit = quote.quoteData((await f.db.operation.findUniqueOrThrow({ where: { id: isolated.id } })).responseData)
        assert.equal(evidence.extractFinancialReviewMetadata(audit).latestDecision?.action, 'RESOLVE_PRE_MUTATION')
        await assert.rejects(f.db.$transaction(tx => guard.createGuardedRenewalOperation(tx, admission)),
            (error: unknown) => guard.isRenewalCreationBlockedError(error) && error.reason === 'CARD_COOLDOWN')
        const futureGuard = loadIsolatedModule<typeof guard>('src/lib/operations/renewal-creation-guard.ts', {
            '@/lib/operations/card-lifecycle-reservation': cardReservations,
            './renewal-card-cooldown': { ...cooldown, readRenewalCardCooldown: (db: Parameters<typeof cooldown.readRenewalCardCooldown>[0], card: string) =>
                cooldown.readRenewalCardCooldown(db, card, new Date(Date.now() + 600_000)) },
            '../../../shared/operations/package-quote': quote,
        })
        const admitted = await f.db.$transaction(tx => futureGuard.createGuardedRenewalOperation(tx, admission))
        assert.equal(admitted.status, 'PENDING')
        assert.ok((await f.db.cardLifecycleReservation.findUniqueOrThrow({ where: { operationId: op.id } })).releasedAt)
        assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: op.id } })).renewalCooldownUntil?.getTime(), deadline)

        // Force a failure after the issue update. The real transaction must keep
        // the issue and operation unchanged, not leave an apparently freed card.
        const original = f.db.$transaction.bind(f.db)
        const failing = new Proxy(f.db, { get(target, key) {
            if (key !== '$transaction') return Reflect.get(target, key)
            return (run: (tx: unknown) => unknown) => original(async tx => run(new Proxy(tx, { get(inner, field) {
                if (field === 'operationDispatch') return { updateMany: async () => { throw new Error('SYNTHETIC_AFTER_ISSUE_FAILURE') } }
                return Reflect.get(inner, field)
            } })))
        } })
        const worker = loadIsolatedModule<typeof import('../../worker/src/lib/pre-mutation-renewal-finalization')>(
            'worker/src/lib/pre-mutation-renewal-finalization.ts', { '@prisma/client': { Prisma, OperationStatus }, './prisma': { prisma: failing } })
        await assert.rejects(worker.finalizePreMutationRenewalTermination({ ...input, operationId: other.id }), /SYNTHETIC_AFTER_ISSUE_FAILURE/)
        assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: other.id } })).status, 'FAILED')
        assert.equal(await f.db.operationIntegrityIssue.count({ where: { operationId: other.id, status: 'OPEN' } }), 1)
    } finally { await f.close() }
})
