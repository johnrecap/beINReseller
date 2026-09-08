import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

function isDisposableDatabaseConfigured(): boolean {
    const rawUrl = process.env.DATABASE_URL
    if (!runDbIntegration || !rawUrl) return false
    if (process.env.CONFIRM_DISPOSABLE_RENEWAL_FULFILLMENT_DB === '1') return true
    try {
        const databaseName = decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, '')).toLowerCase()
        return /(^|[_-])(test|testing|ci|spec|disposable)([_-]|$)/.test(databaseName)
    } catch {
        return false
    }
}

const dbSkipReason = isDisposableDatabaseConfigured()
    ? false
    : 'RELEASE_BLOCKER: configure an explicitly disposable PostgreSQL database for atomic refund replay tests'

test('pre-mutation finalizer refunds and terminates once, while missing settlement stays reserved for review', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeWebPreMutationRenewalTermination }] = await Promise.all([
        import('@/lib/prisma'),
        import('@/lib/operations/pre-mutation-renewal-finalization'),
    ])
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
        data: {
            username: `pre-mutation-${suffix}`,
            email: `pre-mutation-${suffix}@example.test`,
            passwordHash: 'test',
            balance: 100,
        },
    })
    const account = await prisma.beinAccount.create({
        data: { username: `pre-mutation-${suffix}@bein.test`, password: 'test-only' },
    })
    const operationIds: string[] = []
    const extraAccountIds: string[] = []

    try {
        const operation = await prisma.operation.create({
            data: {
                userId: user.id,
                beinAccountId: account.id,
                type: 'RENEW',
                cardNumber: '7517687311',
                amount: 174,
                status: 'AWAITING_FINAL_CONFIRM',
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'UNVERIFIED',
                fulfillmentAuthority: 'NONE',
                responseData: { operationPhase: 'FINAL_CONFIRMATION_REQUESTED' },
            },
        })
        operationIds.push(operation.id)
        await Promise.all([
            prisma.transaction.create({
                data: {
                    userId: user.id,
                    operationId: operation.id,
                    type: 'OPERATION_DEDUCT',
                    amount: -174,
                    balanceAfter: 100,
                    notes: 'test deduction',
                },
            }),
            prisma.cardLifecycleReservation.create({
                data: { operationId: operation.id, cardNumber: operation.cardNumber },
            }),
            prisma.providerAccountCausalReservation.create({
                data: {
                    operationId: operation.id,
                    beinAccountId: account.id,
                    automaticWindowEndsAt: new Date(Date.now() + 60_000),
                },
            }),
        ])

        const attempts = await Promise.all([
            finalizeWebPreMutationRenewalTermination({
                operationId: operation.id,
                terminalStatus: 'FAILED',
                allowedStatuses: ['AWAITING_FINAL_CONFIRM'],
                responseMessage: 'Synthetic timeout',
                releaseReason: 'TEST_TIMEOUT',
                retryCount: 1,
            }),
            finalizeWebPreMutationRenewalTermination({
                operationId: operation.id,
                terminalStatus: 'FAILED',
                allowedStatuses: ['AWAITING_FINAL_CONFIRM'],
                responseMessage: 'Synthetic timeout',
                releaseReason: 'TEST_TIMEOUT',
                retryCount: 1,
            }),
        ])
        assert.deepEqual(
            attempts.map((attempt) => attempt.status).sort(),
            ['ALREADY_TERMINATED', 'TERMINATED'],
        )
        assert.equal(await prisma.transaction.count({
            where: { operationId: operation.id, type: 'REFUND' },
        }), 1)
        assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance, 274)
        const terminated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            include: { cardLifecycleReservation: true, providerAccountCausalReservation: true },
        })
        assert.equal(terminated.status, 'FAILED')
        assert.ok(terminated.cardLifecycleReservation?.releasedAt)
        assert.ok(terminated.providerAccountCausalReservation?.releasedAt)

        const ambiguous = await prisma.operation.create({
            data: {
                userId: user.id,
                beinAccountId: account.id,
                type: 'RENEW',
                cardNumber: '7517687312',
                amount: 174,
                status: 'AWAITING_FINAL_CONFIRM',
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'UNVERIFIED',
                fulfillmentAuthority: 'NONE',
                responseData: { operationPhase: 'FINAL_CONFIRMATION_REQUESTED' },
            },
        })
        operationIds.push(ambiguous.id)
        await Promise.all([
            prisma.cardLifecycleReservation.create({
                data: { operationId: ambiguous.id, cardNumber: ambiguous.cardNumber },
            }),
            prisma.providerAccountCausalReservation.create({
                data: {
                    operationId: ambiguous.id,
                    beinAccountId: account.id,
                    automaticWindowEndsAt: new Date(Date.now() + 60_000),
                },
            }),
        ])
        const missingLedger = await finalizeWebPreMutationRenewalTermination({
            operationId: ambiguous.id,
            terminalStatus: 'CANCELLED',
            allowedStatuses: ['AWAITING_FINAL_CONFIRM'],
            responseMessage: 'Synthetic cancellation',
            releaseReason: 'TEST_CANCEL',
        })
        assert.equal(missingLedger.status, 'REVIEW_REQUIRED')
        const held = await prisma.operation.findUniqueOrThrow({
            where: { id: ambiguous.id },
            include: { cardLifecycleReservation: true, providerAccountCausalReservation: true },
        })
        assert.equal(held.status, 'REVIEW_REQUIRED')
        assert.equal(held.cardLifecycleReservation?.releasedAt, null)
        assert.equal(held.providerAccountCausalReservation?.releasedAt, null)

        const checkedAt = new Date()
        // The held operation intentionally owns the first account. A separate
        // active operation must use another account under the causal constraint.
        const freshAccount = await prisma.beinAccount.create({ data: {
            username: `pre-mutation-fresh-${suffix}@bein.test`, password: 'test-only',
        } })
        extraAccountIds.push(freshAccount.id)
        const freshHeartbeat = await prisma.operation.create({
            data: {
                userId: user.id,
                beinAccountId: freshAccount.id,
                type: 'RENEW',
                cardNumber: '7517687313',
                amount: 0,
                status: 'AWAITING_FINAL_CONFIRM',
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'UNVERIFIED',
                fulfillmentAuthority: 'NONE',
                lastHeartbeat: checkedAt,
                heartbeatExpiry: new Date(checkedAt.getTime() + 60_000),
                responseData: { operationPhase: 'FINAL_CONFIRMATION_REQUESTED' },
            },
        })
        operationIds.push(freshHeartbeat.id)
        await Promise.all([
            prisma.cardLifecycleReservation.create({
                data: { operationId: freshHeartbeat.id, cardNumber: freshHeartbeat.cardNumber },
            }),
            prisma.providerAccountCausalReservation.create({
                data: {
                    operationId: freshHeartbeat.id,
                    beinAccountId: freshAccount.id,
                    automaticWindowEndsAt: new Date(Date.now() + 60_000),
                },
            }),
        ])
        const heartbeatRace = await finalizeWebPreMutationRenewalTermination({
            operationId: freshHeartbeat.id,
            terminalStatus: 'EXPIRED',
            allowedStatuses: ['AWAITING_FINAL_CONFIRM'],
            responseMessage: 'Synthetic stale heartbeat',
            releaseReason: 'TEST_HEARTBEAT_TIMEOUT',
            expectedStaleHeartbeat: {
                checkedAt,
                noHeartbeatBefore: new Date(checkedAt.getTime() - 5_000),
            },
        })
        assert.deepEqual(heartbeatRace, {
            status: 'EVIDENCE_CONFLICT',
            reason: 'HEARTBEAT_NO_LONGER_STALE',
        })
        const stillActive = await prisma.operation.findUniqueOrThrow({
            where: { id: freshHeartbeat.id },
            include: { cardLifecycleReservation: true, providerAccountCausalReservation: true },
        })
        assert.equal(stillActive.status, 'AWAITING_FINAL_CONFIRM')
        assert.equal(stillActive.cardLifecycleReservation?.releasedAt, null)
        assert.equal(stillActive.providerAccountCausalReservation?.releasedAt, null)
    } finally {
        await prisma.providerAccountCausalReservation.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.cardLifecycleReservation.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.notification.deleteMany({ where: { userId: user.id } })
        await prisma.transaction.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operation.deleteMany({ where: { id: { in: operationIds } } })
        await prisma.beinAccount.delete({ where: { id: account.id } })
        await prisma.beinAccount.deleteMany({ where: { id: { in: extraAccountIds } } })
        await prisma.user.delete({ where: { id: user.id } })
    }
})
