import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { disposableDatabaseSkipReason } from '../helpers/disposable-database'

test('reconciliation apply is constrained to integrity issue upserts', () => {
    const script = readFileSync(join(process.cwd(), 'scripts', 'reconcile-renewal-fulfillment.ts'), 'utf8')

    assert.match(script, /operationIntegrityIssue\.upsert/)
    assert.doesNotMatch(script, /applyRefund|recordRefund|providerPay|\.transaction\.create|pointLedgerEntry\.create|notification\.create/)
})

test('repeated reconciliation apply is idempotent and financially non-mutating', { skip: disposableDatabaseSkipReason }, async () => {
    assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
    const { default: prisma } = await import('@/lib/prisma')
    const suffix = `reconcile-${Date.now()}`
    const cardNumber = `75${String(Date.now()).slice(-9)}`
    const createdAt = [new Date('2026-08-23T15:40:00.000Z'), new Date('2026-08-23T15:41:00.000Z')]
    const user = await prisma.user.create({
        data: { username: suffix, email: `${suffix}@example.test`, passwordHash: 'test', balance: 500 },
    })
    const account = await prisma.beinAccount.create({
        data: { username: `${suffix}@bein.test`, password: 'test-only' },
    })
    const operations = await Promise.all(createdAt.map((timestamp) => prisma.operation.create({
        data: {
            userId: user.id,
            beinAccountId: account.id,
            type: 'RENEW',
            cardNumber,
            amount: 174,
            status: 'COMPLETED',
            completedAt: timestamp,
            createdAt: timestamp,
            selectedPackage: { name: 'Premium 12 Months', price: 174 },
        },
    })))

    try {
        await Promise.all(operations.map((operation, index) => prisma.beinAccountSpendLedger.create({
            data: {
                operationId: operation.id,
                userId: user.id,
                beinAccountId: account.id,
                operationType: 'RENEW',
                operationStatusAtRecord: 'COMPLETED',
                cardNumberSnapshot: cardNumber,
                selectedPackageName: 'Premium 12 Months',
                selectedPackagePrice: 174,
                dealerBalanceBefore: 1000 - (index * 174),
                dealerBalanceAfter: 826 - (index * 174),
                spendAmount: 174,
                evidenceSource: 'BALANCE_DELTA',
                beinUsernameSnapshot: account.username,
                chargedAt: createdAt[index],
            },
        })))

        const operationIds = operations.map((operation) => operation.id)
        const before = {
            balance: (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } })).balance,
            operations: await prisma.operation.findMany({
                where: { id: { in: operationIds } },
                select: { id: true, status: true, completedAt: true },
                orderBy: { id: 'asc' },
            }),
            transactions: await prisma.transaction.count({ where: { operationId: { in: operationIds } } }),
            points: await prisma.pointLedgerEntry.count({ where: { operationId: { in: operationIds } } }),
            notifications: await prisma.notification.count({ where: { userId: user.id } }),
        }

        const command = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
        const script = join(process.cwd(), 'scripts', 'reconcile-renewal-fulfillment.ts')
        const args = [
            script,
            '--from', '2026-08-23T18:35:00+03:00',
            '--to', '2026-08-23T18:45:00+03:00',
            '--card', cardNumber,
            '--apply',
            '--confirm', 'APPLY_FULFILLMENT_SAFETY_ISSUES',
        ]
        const first = spawnSync(process.execPath, [command, ...args], {
            cwd: process.cwd(),
            env: process.env,
            encoding: 'utf8',
        })
        assert.equal(first.status, 0, first.stderr || first.stdout)
        const firstIssueCount = await prisma.operationIntegrityIssue.count({
            where: { operationId: { in: operationIds } },
        })

        const second = spawnSync(process.execPath, [command, ...args], {
            cwd: process.cwd(),
            env: process.env,
            encoding: 'utf8',
        })
        assert.equal(second.status, 0, second.stderr || second.stdout)
        assert.equal(await prisma.operationIntegrityIssue.count({
            where: { operationId: { in: operationIds } },
        }), firstIssueCount)

        const after = {
            balance: (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } })).balance,
            operations: await prisma.operation.findMany({
                where: { id: { in: operationIds } },
                select: { id: true, status: true, completedAt: true },
                orderBy: { id: 'asc' },
            }),
            transactions: await prisma.transaction.count({ where: { operationId: { in: operationIds } } }),
            points: await prisma.pointLedgerEntry.count({ where: { operationId: { in: operationIds } } }),
            notifications: await prisma.notification.count({ where: { userId: user.id } }),
        }
        assert.ok(firstIssueCount > 0)
        assert.deepEqual(after, before)
    } finally {
        const operationIds = operations.map((operation) => operation.id)
        await prisma.operationIntegrityIssue.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.beinAccountSpendLedger.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operation.deleteMany({ where: { id: { in: operationIds } } })
        await prisma.beinAccount.delete({ where: { id: account.id } })
        await prisma.user.delete({ where: { id: user.id } })
    }
})
