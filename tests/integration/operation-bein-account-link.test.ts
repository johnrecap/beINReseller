import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

async function createUser(prisma: Awaited<typeof import('@/lib/prisma')>['default'], suffix: string) {
    return prisma.user.create({
        data: {
            username: `bein-ledger-${suffix}`,
            email: `bein-ledger-${suffix}@example.test`,
            passwordHash: 'test',
        },
    })
}

async function createAccount(prisma: Awaited<typeof import('@/lib/prisma')>['default'], suffix: string) {
    return prisma.beinAccount.create({
        data: {
            username: `bein-ledger-${suffix}@account.test`,
            password: 'encrypted-test',
            label: `Ledger ${suffix}`,
        },
    })
}

test('records confirmed spend when operation account matches charged account', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { recordConfirmedBeinSpend } = await import('../../worker/src/lib/bein-spend-ledger')
    const suffix = `match-${Date.now()}`
    const user = await createUser(prisma, suffix)
    const account = await createAccount(prisma, suffix)
    const operation = await prisma.operation.create({
        data: {
            userId: user.id,
            beinAccountId: account.id,
            type: 'RENEW',
            cardNumber: '7518695237',
            amount: 145,
            status: 'PROCESSING',
            selectedPackage: { name: 'Test Package', price: 145 },
        },
    })

    try {
        const result = await recordConfirmedBeinSpend({
            operationId: operation.id,
            userId: user.id,
            beinAccountId: account.id,
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 355,
            evidenceSource: 'BALANCE_DELTA',
        })

        assert.equal(result.status, 'created')
        const ledger = await prisma.beinAccountSpendLedger.findUniqueOrThrow({ where: { operationId: operation.id } })
        assert.equal(ledger.beinAccountId, account.id)
    } finally {
        await prisma.beinAccountSpendLedger.deleteMany({ where: { operationId: operation.id } })
        await prisma.operation.deleteMany({ where: { id: operation.id } })
        await prisma.beinAccount.deleteMany({ where: { id: account.id } })
        await prisma.user.deleteMany({ where: { id: user.id } })
    }
})

test('fills missing operation account from confirmed spend evidence', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { recordConfirmedBeinSpend } = await import('../../worker/src/lib/bein-spend-ledger')
    const suffix = `missing-${Date.now()}`
    const user = await createUser(prisma, suffix)
    const account = await createAccount(prisma, suffix)
    const operation = await prisma.operation.create({
        data: {
            userId: user.id,
            type: 'RENEW',
            cardNumber: '7518695238',
            amount: 92,
            status: 'PROCESSING',
        },
    })

    try {
        const result = await recordConfirmedBeinSpend({
            operationId: operation.id,
            userId: user.id,
            beinAccountId: account.id,
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 408,
            evidenceSource: 'BALANCE_DELTA',
        })

        assert.equal(result.status, 'created')
        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            select: { beinAccountId: true },
        })
        assert.equal(updated.beinAccountId, account.id)
    } finally {
        await prisma.beinAccountSpendLedger.deleteMany({ where: { operationId: operation.id } })
        await prisma.operation.deleteMany({ where: { id: operation.id } })
        await prisma.beinAccount.deleteMany({ where: { id: account.id } })
        await prisma.user.deleteMany({ where: { id: user.id } })
    }
})

test('flags review when confirmed spend account conflicts with operation account', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { recordConfirmedBeinSpend } = await import('../../worker/src/lib/bein-spend-ledger')
    const suffix = `conflict-${Date.now()}`
    const user = await createUser(prisma, suffix)
    const chargedAccount = await createAccount(prisma, `${suffix}-charged`)
    const operationAccount = await createAccount(prisma, `${suffix}-operation`)
    const operation = await prisma.operation.create({
        data: {
            userId: user.id,
            beinAccountId: operationAccount.id,
            type: 'RENEW',
            cardNumber: '7518695239',
            amount: 150,
            status: 'PROCESSING',
        },
    })

    try {
        const result = await recordConfirmedBeinSpend({
            operationId: operation.id,
            userId: user.id,
            beinAccountId: chargedAccount.id,
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 350,
            evidenceSource: 'BALANCE_DELTA',
        })

        assert.equal(result.status, 'conflict_review_required')
        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            select: { status: true, beinAccountId: true },
        })
        const ledger = await prisma.beinAccountSpendLedger.findUniqueOrThrow({ where: { operationId: operation.id } })
        assert.equal(updated.status, 'REVIEW_REQUIRED')
        assert.equal(updated.beinAccountId, operationAccount.id)
        assert.equal(ledger.beinAccountId, chargedAccount.id)
    } finally {
        await prisma.beinAccountSpendLedger.deleteMany({ where: { operationId: operation.id } })
        await prisma.operation.deleteMany({ where: { id: operation.id } })
        await prisma.beinAccount.deleteMany({ where: { id: { in: [chargedAccount.id, operationAccount.id] } } })
        await prisma.user.deleteMany({ where: { id: user.id } })
    }
})
