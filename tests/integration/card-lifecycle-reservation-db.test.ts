import test from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveCardLifecycleReservationDisposition,
} from '../../src/lib/operations/card-lifecycle-reservation'
import { disposableDatabaseSkipReason } from '../helpers/disposable-database'

function suffix(label: string): string {
    return `card-reservation-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

test('T028 unresolved review holds the card until an explicit manual resolution', () => {
    assert.deepEqual(
        resolveCardLifecycleReservationDisposition({
            operationStatus: 'REVIEW_REQUIRED',
            terminalResolutionSafe: false,
            manualReviewResolutionId: null,
        }),
        { action: 'HOLD', reason: 'UNRESOLVED_REVIEW' }
    )

    assert.deepEqual(
        resolveCardLifecycleReservationDisposition({
            operationStatus: 'REVIEW_REQUIRED',
            terminalResolutionSafe: false,
            manualReviewResolutionId: 'manual-resolution-1',
        }),
        { action: 'RELEASE', reason: 'MANUAL_REVIEW_RESOLVED' }
    )
})

test('T028 only an evidenced safe terminal state releases the card automatically', () => {
    for (const operationStatus of ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'] as const) {
        assert.deepEqual(
            resolveCardLifecycleReservationDisposition({
                operationStatus,
                terminalResolutionSafe: true,
                manualReviewResolutionId: null,
            }),
            { action: 'RELEASE', reason: 'SAFE_TERMINAL' },
            operationStatus
        )
    }

    for (const operationStatus of ['PROCESSING', 'COMPLETING', 'FAILED'] as const) {
        assert.equal(
            resolveCardLifecycleReservationDisposition({
                operationStatus,
                terminalResolutionSafe: false,
                manualReviewResolutionId: null,
            }).action,
            'HOLD',
            operationStatus
        )
    }
})

test('T028 database permits one active reservation winner for a card', { skip: disposableDatabaseSkipReason }, async () => {
    assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
    const { default: prisma } = await import('@/lib/prisma')
    const db = prisma as typeof prisma & {
        cardLifecycleReservation: {
            create(args: unknown): Promise<{ id: string }>
            count(args: unknown): Promise<number>
            deleteMany(args: unknown): Promise<unknown>
        }
    }
    const marker = suffix('winner')
    const user = await prisma.user.create({
        data: {
            username: marker,
            email: `${marker}@example.test`,
            passwordHash: 'test',
        },
    })
    const cardNumber = `75${Date.now().toString().slice(-8)}`
    const operations = await Promise.all(['a', 'b'].map((part) => prisma.operation.create({
        data: {
            userId: user.id,
            type: 'RENEW',
            cardNumber,
            amount: 174,
            // Two review rows can exist historically; the reservation itself
            // must still have one winner. Active rows are already excluded by
            // operations_one_active_per_card before this assertion can run.
            status: 'REVIEW_REQUIRED',
            responseMessage: marker + part,
        },
    })))
    const acquiredAt = new Date()

    try {
        const attempts = await Promise.allSettled(operations.map((operation) =>
            db.cardLifecycleReservation.create({
                data: {
                    operationId: operation.id,
                    cardNumber,
                    acquiredAt,
                    renewedAt: acquiredAt,
                },
            })
        ))

        assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1)
        assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1)
        assert.equal(await db.cardLifecycleReservation.count({
            where: { cardNumber, releasedAt: null },
        }), 1)
    } finally {
        await db.cardLifecycleReservation.deleteMany({
            where: { operationId: { in: operations.map((operation) => operation.id) } },
        })
        await prisma.operation.deleteMany({ where: { id: { in: operations.map((operation) => operation.id) } } })
        await prisma.user.delete({ where: { id: user.id } })
    }
})

test('T028 database keeps review reservation active until audited manual release', { skip: disposableDatabaseSkipReason }, async () => {
    assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
    const { default: prisma } = await import('@/lib/prisma')
    const db = prisma as typeof prisma & {
        cardLifecycleReservation: {
            create(args: unknown): Promise<{ id: string }>
            update(args: unknown): Promise<unknown>
            findUniqueOrThrow(args: unknown): Promise<{ releasedAt: Date | null; releaseReason: string | null }>
            deleteMany(args: unknown): Promise<unknown>
        }
    }
    const marker = suffix('review')
    const user = await prisma.user.create({
        data: {
            username: marker,
            email: `${marker}@example.test`,
            passwordHash: 'test',
        },
    })
    const cardNumber = `76${Date.now().toString().slice(-8)}`
    const operations = await Promise.all(['owner', 'waiter'].map((part) => prisma.operation.create({
        data: {
            userId: user.id,
            type: 'RENEW',
            cardNumber,
            amount: 174,
            status: part === 'owner' ? 'REVIEW_REQUIRED' : 'PENDING',
            responseMessage: marker + part,
        },
    })))
    const acquiredAt = new Date()

    try {
        await db.cardLifecycleReservation.create({
            data: {
                operationId: operations[0].id,
                cardNumber,
                acquiredAt,
                renewedAt: acquiredAt,
            },
        })

        await assert.rejects(() => db.cardLifecycleReservation.create({
            data: {
                operationId: operations[1].id,
                cardNumber,
                acquiredAt,
                renewedAt: acquiredAt,
            },
        }))

        const held = await db.cardLifecycleReservation.findUniqueOrThrow({
            where: { operationId: operations[0].id },
            select: { releasedAt: true, releaseReason: true },
        })
        assert.equal(held.releasedAt, null)
        assert.equal(held.releaseReason, null)

        await db.cardLifecycleReservation.update({
            where: { operationId: operations[0].id },
            data: {
                releasedAt: new Date(),
                releaseReason: 'MANUAL_REVIEW_RESOLVED:manual-resolution-1',
            },
        })
        await db.cardLifecycleReservation.create({
            data: {
                operationId: operations[1].id,
                cardNumber,
                acquiredAt: new Date(),
                renewedAt: new Date(),
            },
        })
    } finally {
        await db.cardLifecycleReservation.deleteMany({
            where: { operationId: { in: operations.map((operation) => operation.id) } },
        })
        await prisma.operation.deleteMany({ where: { id: { in: operations.map((operation) => operation.id) } } })
        await prisma.user.delete({ where: { id: user.id } })
    }
})
