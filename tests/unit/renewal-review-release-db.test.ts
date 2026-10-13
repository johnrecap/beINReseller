import test from 'node:test'
import assert from 'node:assert/strict'
import { openPglitePrisma } from '../helpers/pglite-prisma'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as guard from '../../src/lib/operations/renewal-creation-guard'
import * as reservations from '../../src/lib/operations/card-lifecycle-reservation'
import * as cooldown from '../../src/lib/operations/renewal-card-cooldown'
import { releaseEndedRenewalReservations, endedOperationExecutionIdle } from '../../shared/operations/renewal-pre-payment'
import { acquireProviderAccountCausalReservation } from '../../worker/src/lib/provider-account-reservation'
import * as quote from '../../shared/operations/package-quote'
import * as price from '../../shared/operations/provider-price'
import * as identity from '../../worker/src/lib/report-package-identity'
import { Prisma } from '@prisma/client'

test('SQL: review ownership drains, releases once, preserves money/evidence/cooldown, and cannot reopen', async () => {
    const f = await openPglitePrisma()
    try {
        const user = await f.db.user.create({ data: { username: 'review-owner', email: 'review@local.test', passwordHash: 'test', balance: 8 } })
        const account = await f.db.beinAccount.create({ data: { username: 'review-account', password: 'test' } })
        const old = await f.db.operation.create({ data: { id: 'old-review', type: 'RENEW', userId: user.id,
            beinAccountId: account.id, cardNumber: '7000000044', status: 'REVIEW_REQUIRED', amount: 92,
            providerPaymentState: 'UNKNOWN', responseData: { operationPhase: 'POST_FINAL_PAY_REVIEW' } } })
        await f.db.transaction.create({ data: { userId: user.id, operationId: old.id, type: 'OPERATION_DEDUCT', amount: -92, balanceAfter: 8 } })
        const other = await f.db.operation.create({ data: { id: 'other-review', type: 'RENEW', cardNumber: old.cardNumber,
            status: 'REVIEW_REQUIRED', amount: 92, providerPaymentState: 'UNKNOWN' } })
        await f.db.operationIntegrityIssue.createMany({ data: [old, other].map(op => ({ operationId: op.id, issueType: 'DUPLICATE_RENEWAL_CHARGE_BURST' })) })
        await f.db.cardLifecycleReservation.create({ data: { operationId: old.id, cardNumber: old.cardNumber } })
        await f.db.providerAccountCausalReservation.create({ data: { operationId: old.id, beinAccountId: account.id, automaticWindowEndsAt: new Date() } })
        const request = await f.db.operationProviderRequest.create({ data: { operationId: old.id, method: 'POST', deadlineAt: new Date(Date.now() + 60_000) } })
        const release = (idle = true) => f.db.$transaction(tx => releaseEndedRenewalReservations(tx, old.id, async () => idle))
        assert.equal(await release(), false, 'in-flight HTTP cannot be released')
        await f.db.operationProviderRequest.update({ where: { id: request.id }, data: { finishedAt: new Date(), resultCode: 'HTTP_200' } })
        assert.equal(await release(false), false, 'owned worker lease must also drain')
        assert.deepEqual(await Promise.all([release(), release()]), [true, false])
        assert.deepEqual(await f.db.operation.findUniqueOrThrow({ where: { id: old.id } }), old)
        assert.equal(await f.db.operationIntegrityIssue.count({ where: { status: 'OPEN' } }), 2)
        assert.equal(await f.db.transaction.count(), 1)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: user.id } })).balance, 8)
        await assert.rejects(f.db.$transaction(tx => reservations.acquireCardLifecycleReservation(tx,
            { operationId: old.id, cardNumber: old.cardNumber })), /INVALID_RENEWAL_OPERATION_STATE/)
        assert.equal((await f.db.$transaction(tx => acquireProviderAccountCausalReservation(tx,
            { operationId: old.id, beinAccountId: account.id, automaticWindowEndsAt: new Date(Date.now() + 60000) }))).status, 'OPERATION_ENDED_OR_MISSING')
        const input = { cardNumber: old.cardNumber, data: { amount: 0, userId: user.id } }
        await assert.rejects(f.db.$transaction(tx => guard.createGuardedRenewalOperation(tx, input)), { reason: 'CARD_COOLDOWN' })
        const future = loadIsolatedModule<typeof guard>('src/lib/operations/renewal-creation-guard.ts', {
            '@/lib/operations/card-lifecycle-reservation': reservations, '../../../shared/operations/package-quote': quote,
            './renewal-card-cooldown': { ...cooldown, readRenewalCardCooldown: (db: Parameters<typeof cooldown.readRenewalCardCooldown>[0], card: string) =>
                cooldown.readRenewalCardCooldown(db, card, new Date(Date.now() + 600_000)) },
        })
        const attempts = await Promise.allSettled([0, 1].map(() => f.db.$transaction(tx => future.createGuardedRenewalOperation(tx, input))))
        assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
        assert.equal(await release(), false)
        assert.equal(await f.db.cardLifecycleReservation.count({ where: { cardNumber: old.cardNumber, releasedAt: null } }), 1)
    } finally { await f.close() }
})

test('execution owner check preserves foreign owners and defers malformed or same-operation leases', async () => {
    for (const [raw, idle] of [[null, true], ['{"operationId":"other"}', true], ['{"operationId":"old"}', false], ['broken', false]] as const) {
        assert.equal(await endedOperationExecutionIdle({ get: async () => raw }, 'account', 'old'), idle)
    }
})

test('SQL: an unclaimed same-day invoice cannot be attributed across unresolved attempts', async () => {
    const f = await openPglitePrisma()
    try {
        const { hasCompetingReportAttempt } = loadIsolatedModule<typeof import('../../worker/src/lib/same-day-report-fulfillment')>(
            'worker/src/lib/same-day-report-fulfillment.ts', { '@prisma/client': { Prisma }, './prisma': { prisma: f.db },
                './fulfillment-baseline': {}, './fulfillment-finalization': {},
                '../../../shared/operations/provider-price': price, './report-package-identity': identity })
        const account = await f.db.beinAccount.create({ data: { username: 'invoice-attribution', password: 'test' } })
        const old = await f.db.operation.create({ data: { id: 'earlier', type: 'RENEW', cardNumber: '7000000055', beinAccountId: account.id,
            status: 'REVIEW_REQUIRED', amount: 43.2, providerPaymentState: 'UNKNOWN', createdAt: new Date('2026-10-13T04:00:00Z'),
            providerMutationStartedAt: new Date('2026-10-13T04:00:30Z'),
            selectedPackage: { name: 'Together 6 Months + 20% OFF (6 Months)', price: 43.2, currency: 'USD' } } })
        const current = { ...old, id: 'new', createdAt: new Date('2026-10-13T05:00:00Z') }
        const row = { invoiceNo: 'unknown-owner', cardNumber: old.cardNumber, itemType: 'Card_CISCO',
            packageName: 'Add Together 6 Months + 20% OFF', providerAmount: '43.20', currency: 'USD' as const,
            rowFingerprint: 'a'.repeat(64), contractStartDate: '', contractExpiryDate: '' }
        assert.equal(await hasCompetingReportAttempt(f.db, current, row, '2026-10-13'), true)
        assert.equal(await hasCompetingReportAttempt(f.db, current, { ...row, packageName: 'Add Premium 6 Months + 20% OFF' }, '2026-10-13'), false)
        assert.equal(await hasCompetingReportAttempt(f.db, current, row, '2026-10-14'), false)
        const legacy = await f.db.operation.update({ where: { id: old.id }, data: { fulfillmentAuthority: null } })
        assert.equal(await hasCompetingReportAttempt(f.db, current, row, '2026-10-13'), true,
            'legacy attempts without an authority value still make invoice ownership ambiguous')
        assert.equal(await f.db.providerInvoiceClaim.count(), 0)
        assert.deepEqual(await f.db.operation.findUniqueOrThrow({ where: { id: old.id } }), legacy)
    } finally { await f.close() }
})
