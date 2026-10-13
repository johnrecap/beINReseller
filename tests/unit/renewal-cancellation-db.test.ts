import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma, OperationStatus } from '@prisma/client'
import { openPglitePrisma } from '../helpers/pglite-prisma'
import { loadDispatch, loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import { mergeOperationPhaseEvidence } from '../../src/lib/operation-safety'
import * as locks from '../../shared/operations/financial-lock'
import * as quote from '../../shared/operations/package-quote'
import * as guard from '../../src/lib/operations/renewal-creation-guard'

test('SQL: second-confirm cancellation survives replay and preserves the cooldown without financial review', async () => {
    const f = await openPglitePrisma()
    try {
        const user = await f.db.user.create({ data: { username: 'cancel-owner', email: 'cancel@local.test', passwordHash: 'test', balance: 100 } })
        const account = await f.db.beinAccount.create({ data: { username: 'cancel-account', password: 'test' } })
        const dispatch = loadDispatch()
        const api = loadIsolatedModule<{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(
            'src/app/api/operations/[id]/cancel-confirm/route.ts', {
                'next/server': { NextResponse: { json: Response.json } }, '@/lib/prisma': { default: f.db },
                '@/lib/auth-utils': { getAuthenticatedUser: async () => ({ id: user.id }) },
                '@/lib/operation-safety': { mergeOperationPhaseEvidence },
                '../../../../../../shared/operations/financial-lock': locks,
                '../../../../../../shared/operations/package-quote': quote,
                '@/lib/operations/renewal-creation-guard': guard,
                '@/lib/operation-dispatch': { createOperationDispatch: dispatch.createOperationDispatch,
                    dispatchPendingOperationJobs: async () => ({ failed: 1 }) }, // durable retry, no queue/network
            })
        const worker = loadIsolatedModule<typeof import('../../worker/src/lib/pre-mutation-renewal-finalization')>(
            'worker/src/lib/pre-mutation-renewal-finalization.ts', { '@prisma/client': { Prisma, OperationStatus }, './prisma': { prisma: f.db } })
        const cancel = (id: string) => api.POST(new Request('https://local.test/cancel', { method: 'POST' }), { params: Promise.resolve({ id }) })
        for (const serialized of [false, true]) {
            const responseData = { operationPhase: 'FINAL_CONFIRMATION_REQUESTED', providerMutationMayHaveStarted: true,
                finalPaySubmitted: false, promoCodeApplied: serialized, quoteRevision: serialized ? 1 : 0 }
            const op = await f.db.operation.create({ data: { type: 'RENEW', userId: user.id, beinAccountId: account.id,
                cardNumber: serialized ? '7000000033' : '7000000022', status: 'AWAITING_FINAL_CONFIRM', amount: 0,
                renewalFlowVersion: 2, providerPaymentState: 'NOT_SUBMITTED', fulfillmentState: 'UNVERIFIED', fulfillmentAuthority: 'NONE',
                responseData: serialized ? JSON.stringify(responseData) : responseData,
                finalConfirmExpiry: new Date(Date.now() + 60000), heartbeatExpiry: new Date(Date.now() + 60000) } })
            await f.db.cardLifecycleReservation.create({ data: { operationId: op.id, cardNumber: op.cardNumber } })
            await f.db.providerAccountCausalReservation.create({ data: { operationId: op.id, beinAccountId: account.id, automaticWindowEndsAt: new Date() } })
            const responses = await Promise.all([cancel(op.id), cancel(op.id)])
            for (const response of responses) { assert.equal(response.status, 200); assert.equal((await response.json()).cancellationStatus, 'PENDING') }
            const pending = await f.db.operation.findUniqueOrThrow({ where: { id: op.id } })
            assert.equal(pending.finalConfirmExpiry, null)
            assert.equal(pending.heartbeatExpiry, null)
            assert.equal(pending.status, 'COMPLETING')
            assert.equal(await f.db.operationDispatch.count({ where: { operationId: op.id, jobType: 'CANCEL_CONFIRM' } }), 1)
            const input = { operationId: op.id, terminalStatus: 'CANCELLED' as const, allowedStatuses: ['COMPLETING' as const],
                responseMessage: 'Operation cancelled', releaseReason: 'CANCEL_CONFIRM' }
            assert.equal((await worker.finalizePreMutationRenewalTermination(input)).status, 'TERMINATED')
            const done = await f.db.operation.findUniqueOrThrow({ where: { id: op.id } })
            assert.equal(done.status, 'CANCELLED')
            assert.equal((await worker.finalizePreMutationRenewalTermination(input)).status, 'ALREADY_TERMINATED')
            assert.equal((await (await cancel(op.id)).json()).cancellationStatus, 'COMPLETED')
            assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: op.id } })).renewalCooldownUntil?.getTime(), done.renewalCooldownUntil?.getTime())
            assert.equal(await f.db.cardLifecycleReservation.count({ where: { operationId: op.id, releasedAt: null } }), 0)
            assert.equal(await f.db.providerAccountCausalReservation.count({ where: { operationId: op.id, releasedAt: null } }), 0)
        }
        const paid = await f.db.operation.create({ data: { type: 'RENEW', userId: user.id, cardNumber: '7000000088',
            status: 'AWAITING_FINAL_CONFIRM', amount: 0, renewalFlowVersion: 2, providerMutationStage: 'FINAL_OK',
            responseData: { operationPhase: 'FINAL_CONFIRMATION_REQUESTED', finalPaySubmitted: false } } })
        assert.equal((await cancel(paid.id)).status, 409, 'confirmation won: do not claim cancellation')
        assert.equal(await f.db.operationDispatch.count({ where: { operationId: paid.id } }), 0)
        assert.equal(await f.db.transaction.count(), 0)
        assert.equal(await f.db.operationIntegrityIssue.count(), 0)
        assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: user.id } })).balance, 100)
    } finally { await f.close() }
})
