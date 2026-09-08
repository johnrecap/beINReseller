import test from 'node:test'
import assert from 'node:assert/strict'
import { disposableDatabaseSkipReason } from '../helpers/disposable-database'

function suffix(label: string): string {
    return `provider-reservation-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

test('T028 database permits one active causal reservation per provider account', { skip: disposableDatabaseSkipReason }, async () => {
    assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
    const { default: prisma } = await import('@/lib/prisma')
    const db = prisma as typeof prisma & {
        providerAccountCausalReservation: {
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
    const account = await prisma.beinAccount.create({
        data: {
            username: `${marker}@bein.test`,
            password: 'test-only',
            automationExclusive: true,
        },
    })
    const operations = await Promise.all(['a', 'b'].map((part) => prisma.operation.create({
        data: {
            userId: user.id,
            beinAccountId: account.id,
            type: 'RENEW',
            cardNumber: `75176871${part === 'a' ? '61' : '62'}`,
            amount: 174,
            status: 'PROCESSING',
        },
    })))
    const acquiredAt = new Date()

    try {
        const attempts = await Promise.allSettled(operations.map((operation) =>
            db.providerAccountCausalReservation.create({
                data: {
                    operationId: operation.id,
                    beinAccountId: account.id,
                    reservationGeneration: 1,
                    acquiredAt,
                    renewedAt: acquiredAt,
                    automaticWindowEndsAt: new Date(acquiredAt.getTime() + 60_000),
                },
            })
        ))

        assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1)
        assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1)
        assert.equal(await db.providerAccountCausalReservation.count({
            where: { beinAccountId: account.id, releasedAt: null },
        }), 1)
    } finally {
        await db.providerAccountCausalReservation.deleteMany({
            where: { operationId: { in: operations.map((operation) => operation.id) } },
        })
        await prisma.operation.deleteMany({ where: { id: { in: operations.map((operation) => operation.id) } } })
        await prisma.beinAccount.delete({ where: { id: account.id } })
        await prisma.user.delete({ where: { id: user.id } })
    }
})

test('T028 causal reservation survives delayed jobs and review until manual release', { skip: disposableDatabaseSkipReason }, async () => {
    assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
    const { default: prisma } = await import('@/lib/prisma')
    const db = prisma as typeof prisma & {
        providerAccountCausalReservation: {
            create(args: unknown): Promise<{ id: string }>
            update(args: unknown): Promise<unknown>
            findUniqueOrThrow(args: unknown): Promise<{
                releasedAt: Date | null
                reservationGeneration: number
                automaticWindowEndsAt: Date
            }>
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
    const account = await prisma.beinAccount.create({
        data: {
            username: `${marker}@bein.test`,
            password: 'test-only',
            automationExclusive: true,
        },
    })
    const operations = await Promise.all(['owner', 'waiter'].map((part) => prisma.operation.create({
        data: {
            userId: user.id,
            beinAccountId: account.id,
            type: 'RENEW',
            cardNumber: `75176872${part === 'owner' ? '61' : '62'}`,
            amount: 174,
            status: part === 'owner' ? 'REVIEW_REQUIRED' : 'PENDING',
        },
    })))
    const expiredAutomaticWindow = new Date(Date.now() - 30_000)

    try {
        await db.providerAccountCausalReservation.create({
            data: {
                operationId: operations[0].id,
                beinAccountId: account.id,
                reservationGeneration: 7,
                acquiredAt: new Date(Date.now() - 120_000),
                renewedAt: new Date(Date.now() - 60_000),
                automaticWindowEndsAt: expiredAutomaticWindow,
            },
        })

        const afterJobGap = await db.providerAccountCausalReservation.findUniqueOrThrow({
            where: { operationId: operations[0].id },
            select: {
                releasedAt: true,
                reservationGeneration: true,
                automaticWindowEndsAt: true,
            },
        })
        assert.equal(afterJobGap.releasedAt, null)
        assert.equal(afterJobGap.reservationGeneration, 7)
        assert.equal(afterJobGap.automaticWindowEndsAt.getTime(), expiredAutomaticWindow.getTime())

        await assert.rejects(() => db.providerAccountCausalReservation.create({
            data: {
                operationId: operations[1].id,
                beinAccountId: account.id,
                reservationGeneration: 1,
                acquiredAt: new Date(),
                renewedAt: new Date(),
                automaticWindowEndsAt: new Date(Date.now() + 60_000),
            },
        }))

        await db.providerAccountCausalReservation.update({
            where: { operationId: operations[0].id },
            data: {
                releasedAt: new Date(),
                releaseReason: 'MANUAL_REVIEW_RESOLVED:manual-resolution-1',
            },
        })
        await db.providerAccountCausalReservation.create({
            data: {
                operationId: operations[1].id,
                beinAccountId: account.id,
                reservationGeneration: 1,
                acquiredAt: new Date(),
                renewedAt: new Date(),
                automaticWindowEndsAt: new Date(Date.now() + 60_000),
            },
        })
    } finally {
        await db.providerAccountCausalReservation.deleteMany({
            where: { operationId: { in: operations.map((operation) => operation.id) } },
        })
        await prisma.operation.deleteMany({ where: { id: { in: operations.map((operation) => operation.id) } } })
        await prisma.beinAccount.delete({ where: { id: account.id } })
        await prisma.user.delete({ where: { id: user.id } })
    }
})

test('T028 database prevents two local provider accounts for one canonical login', { skip: disposableDatabaseSkipReason }, async () => {
    assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
    const { default: prisma } = await import('@/lib/prisma')
    const marker = suffix('canonical-login')
    const canonicalUsername = `${marker}@bein.test`

    try {
        const attempts = await Promise.allSettled([
            prisma.beinAccount.create({
                data: { username: canonicalUsername, password: 'test-only' },
            }),
            prisma.beinAccount.create({
                data: { username: `  ${canonicalUsername.toUpperCase()}  `, password: 'test-only' },
            }),
        ])

        assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1)
        assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1)
        assert.equal(await prisma.beinAccount.count({
            where: { username: canonicalUsername },
        }), 1)
    } finally {
        await prisma.beinAccount.deleteMany({ where: { username: canonicalUsername } })
    }
})
