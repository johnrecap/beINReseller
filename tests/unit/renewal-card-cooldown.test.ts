import test from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma } from '@prisma/client'
import { createGuardedRenewalOperation } from '../../src/lib/operations/renewal-creation-guard'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as guard from '../../src/lib/operations/renewal-creation-guard'
import * as cooldown from '../../src/lib/operations/renewal-card-cooldown'
import { z } from 'zod'
import { cooldownDeadline, cooldownSeconds } from '../../src/hooks/useRenewalCardCooldown'

test('a finished renewal blocks a fresh operation before reservation, debit or dispatch', async () => {
    let writes = 0
    const until = new Date(Date.now() + 240_000)
    const tx = {
        cardAdministrativeRelease: { findFirst: async () => null },
        $queryRaw: async () => [],
        operation: {
            findFirst: async ({ where }: { where: Record<string, unknown> }) =>
                where.renewalCooldownUntil ? { renewalCooldownUntil: until } : null,
            create: async () => { writes++; return { id: 'new-operation' } },
        },
        operationIntegrityIssue: { findFirst: async () => null },
        cardLifecycleReservation: {
            findFirst: async () => null, findUnique: async () => null,
            create: async () => { writes++; return {} },
        },
    } as unknown as Prisma.TransactionClient
    await assert.rejects(createGuardedRenewalOperation(tx, {
        cardNumber: '7000000001', data: { amount: 0, userId: 'synthetic-user' },
    }), { code: 'RENEWAL_CARD_COOLDOWN' })
    assert.equal(writes, 0)
})

for (const scenario of ['repeat', 'other-user', 'expired', 'other-card', 'review', 'installment'] as const) {
    test(`server cooldown guard: ${scenario}`, async () => {
        let writes = 0
        let cooldownReads = 0
        const until = new Date(Date.now() + (scenario === 'expired' ? -1 : 120_000))
        const tx = {
            cardAdministrativeRelease: { findFirst: async () => null },
            $queryRaw: async () => [],
            operation: {
                findUnique: async () => ({ status: 'PENDING' }),
                findFirst: async ({ where }: { where: { status?: unknown; cardNumber: string; renewalCooldownUntil?: { gt: Date } } }) => {
                    if (where.status === 'REVIEW_REQUIRED' && scenario === 'review') return { id: 'unresolved' }
                    if (!where.renewalCooldownUntil) return null
                    cooldownReads++
                    return where.cardNumber === '7000000001' && until > where.renewalCooldownUntil.gt
                        ? { renewalCooldownUntil: until } : null
                },
                create: async () => { writes++; return { id: 'new' } },
            },
            operationIntegrityIssue: { findFirst: async () => null },
            cardLifecycleReservation: { findFirst: async () => null, findUnique: async () => null, create: async () => ({}) },
        } as unknown as Prisma.TransactionClient
        const input = { cardNumber: scenario === 'other-card' ? '7000000002' : '7000000001',
            data: { amount: 0, userId: scenario === 'other-user' ? 'different-user' : 'user',
                ...(scenario === 'installment' ? { purpose: 'INSTALLMENT' as const } : {}) } }
        if (['repeat', 'other-user'].includes(scenario)) {
            await assert.rejects(createGuardedRenewalOperation(tx, input), { code: 'RENEWAL_CARD_COOLDOWN' })
            await assert.rejects(createGuardedRenewalOperation(tx, input), { code: 'RENEWAL_CARD_COOLDOWN' })
            assert.equal(writes, 0)
        } else if (scenario === 'review') {
            await assert.rejects(createGuardedRenewalOperation(tx, input), { reason: 'CARD_COOLDOWN' })
            assert.equal(cooldownReads, 1, 'review does not replace the original cooldown')
            assert.equal(writes, 0)
        } else {
            await createGuardedRenewalOperation(tx, input)
            assert.equal(writes, 1)
        }
    })
}

function loadCooldownRoute(options: { authenticated?: boolean; permitted?: boolean; rateAllowed?: boolean } = {}) {
    let reads = 0
    const api = loadIsolatedModule<{ GET?: (request: Request) => Promise<Response> }>(
        'src/app/api/operations/start-renewal/route.ts', {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } },
            '@/lib/auth-utils': { getAuthenticatedUser: async () => options.authenticated === false ? null : { id: 'user', role: 'USER' },
                roleHasPermission: () => options.permitted !== false },
            '@/lib/prisma': { default: { operation: { findFirst: async () => {
                reads++; return { renewalCooldownUntil: new Date(Date.now() + 120_000) }
            } } } },
            zod: { z }, '@/lib/operation-dispatch': {}, '@/lib/redis': {}, '@/lib/maintenance/effective-status': {},
            '@/lib/permissions': { PERMISSIONS: { SUBSCRIPTION_RENEW: 'renew' } },
            '@/lib/renewal-readiness': {},
            '@/lib/rate-limiter': { withRateLimit: async () => ({ allowed: options.rateAllowed !== false, result: {} }),
                RATE_LIMITS: { operations: {} }, rateLimitHeaders: () => ({}) },
            '@/lib/operations/renewal-creation-guard': guard,
            '@/lib/operations/renewal-card-cooldown': cooldown,
        })
    return { api, reads: () => reads }
}

test('countdown uses the server clock and the original deadline after refresh, not a fresh five minutes', () => {
    const cardNumber = '7000000001'
    const snapshot = { cardNumber, serverNow: '2026-10-12T12:00:00Z', cooldownUntil: '2026-10-12T12:05:00Z', remainingSeconds: 300 }
    const clientNow = 1_000_000
    assert.equal(cooldownDeadline(snapshot, cardNumber, clientNow), clientNow + 300_000)
    assert.equal(cooldownDeadline({ ...snapshot, serverNow: '2026-10-12T12:02:00Z' }, cardNumber, clientNow + 120_000), clientNow + 300_000)
    assert.equal(cooldownDeadline(snapshot, '7000000002', clientNow), null)
    assert.equal(cooldownDeadline({ ...snapshot, serverNow: 'invalid' }, cardNumber, clientNow), null)
    assert.equal(cooldownSeconds(clientNow + 300_000, clientNow + 299_999), 1)
    assert.equal(cooldownSeconds(clientNow + 300_000, clientNow + 300_000), 0)
    assert.equal(cooldownSeconds(clientNow + 300_000, clientNow + 301_000), 0)
})

test('reading another card or an expired cooldown returns zero without writing or exposing history', async () => {
    const until = new Date('2026-10-12T12:05:00Z')
    const db = { operation: { findFirst: async ({ where }: { where: { cardNumber: string; renewalCooldownUntil: { gt: Date } } }) =>
        where.cardNumber === '7000000001' && until > where.renewalCooldownUntil.gt ? { renewalCooldownUntil: until } : null,
    } } as unknown as Prisma.TransactionClient
    const first = await cooldown.readRenewalCardCooldown(db, '7000000001', new Date('2026-10-12T12:01:00Z'))
    const again = await cooldown.readRenewalCardCooldown(db, '7000000001', new Date('2026-10-12T12:02:00Z'))
    assert.equal(first.remainingSeconds, 240)
    assert.equal(again.remainingSeconds, 180)
    assert.equal(first.cooldownUntil, again.cooldownUntil)
    assert.equal((await cooldown.readRenewalCardCooldown(db, '7000000002')).remainingSeconds, 0)
    assert.equal((await cooldown.readRenewalCardCooldown(db, '7000000001', until)).remainingSeconds, 0)
    const payload = guard.renewalCreationBlockedPayload(new guard.RenewalCreationBlockedError('CARD_COOLDOWN', '', first))
    assert.equal(payload.code, 'RENEWAL_CARD_COOLDOWN')
    assert.equal('operationId' in payload, false)
})

test('cooldown lookup is read-only, authenticated and contains no operation or account identity', async () => {
    const h = loadCooldownRoute()
    assert.equal(typeof h.api.GET, 'function')
    const response = await h.api.GET!(new Request('https://panel.invalid/api/operations/start-renewal?cardNumber=7000000001'))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.cardNumber, '7000000001')
    assert.equal(body.remainingSeconds, 120)
    assert.equal(body.operationId, undefined)
    assert.equal(body.userId, undefined)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(h.reads(), 1)
})

for (const [options, status] of [[{ authenticated: false }, 401], [{ permitted: false }, 403], [{ rateAllowed: false }, 429]] as const) {
    test(`cooldown lookup rejects ${status} before a database read`, async () => {
        const h = loadCooldownRoute(options)
        assert.equal(typeof h.api.GET, 'function')
        assert.equal((await h.api.GET!(new Request('https://panel.invalid/api/operations/start-renewal?cardNumber=7000000001'))).status, status)
        assert.equal(h.reads(), 0)
    })
}
