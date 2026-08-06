import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { PrismaClient } from '@prisma/client'

type AwardRunDatabase = import('../../shared/points/operation-spend-award-runs').AwardRunDatabase
type CaptureAwardRun = typeof import('@/lib/points/operation-spend-award-runs')['captureOperationSpendAwardRunInTransaction']
type FinalizeAwardRun = typeof import('@/lib/points/operation-spend-award-runs')['finalizeOperationSpendAwardRun']
type TransferOwnership = typeof import('@/lib/users/ownership-transfer')['transferUserOwnershipInTransaction']
type OwnershipTokenBuilder = typeof import('../../shared/db/ownership-evidence-lock')['buildOwnershipToken']

type TestAccount = {
    id: string
    username: string
}

type CreateOperationInput = {
    status?: 'PENDING' | 'COMPLETED'
    completedAt?: Date | null
    amount?: number
}

type AwardFixture = {
    admin: TestAccount
    agentAtCompletion: TestAccount
    agentAfterTransfer: TestAccount
    operationUser: TestAccount
    createOperation(input?: CreateOperationInput): Promise<{
        id: string
        status: 'PENDING' | 'COMPLETED'
        completedAt: Date | null
        amount: number
    }>
}

const runDbIntegration = process.env.RUN_DB_INTEGRATION === '1'
    || process.env.RUN_DB_INTEGRATION === 'true'

async function createIndependentPrismaClient() {
    const [{ PrismaClient }, { PrismaPg }, pgModule] = await Promise.all([
        import('@prisma/client'),
        import('@prisma/adapter-pg'),
        import('pg'),
    ])
    const pool = new pgModule.default.Pool({ connectionString: process.env.DATABASE_URL })
    const client = new PrismaClient({ adapter: new PrismaPg(pool) })
    return {
        client,
        async close() {
            await client.$disconnect()
            await pool.end()
        },
    }
}

async function withTwoIndependentClients<T>(
    scenario: (clients: [PrismaClient, PrismaClient]) => Promise<T>
): Promise<T> {
    const first = await createIndependentPrismaClient()
    const second = await createIndependentPrismaClient()
    try {
        return await scenario([first.client, second.client])
    } finally {
        await Promise.all([first.close(), second.close()])
    }
}

async function cleanupFixture(
    prisma: PrismaClient,
    userIds: string[],
    operationIds: string[],
    pointRuleIds: string[]
) {
    await prisma.pointLedgerEntry.deleteMany({
        where: {
            OR: [
                { operationId: { in: operationIds } },
                { ownerUserId: { in: userIds } },
            ],
        },
    })
    await prisma.operationSpendAwardRun.deleteMany({
        where: { operationId: { in: operationIds } },
    })
    await prisma.operation.deleteMany({ where: { id: { in: operationIds } } })
    await prisma.activityLog.deleteMany({
        where: {
            OR: [
                { userId: { in: userIds } },
                { targetId: { in: userIds } },
            ],
        },
    })
    await prisma.agentAssignment.deleteMany({
        where: {
            OR: [
                { userId: { in: userIds } },
                { agentId: { in: userIds } },
                { assignedByAdminId: { in: userIds } },
            ],
        },
    })
    await prisma.managerUser.deleteMany({
        where: {
            OR: [
                { userId: { in: userIds } },
                { managerId: { in: userIds } },
            ],
        },
    })
    await prisma.pointRule.deleteMany({ where: { id: { in: pointRuleIds } } })
    await prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { createdById: null },
    })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function withAwardFixture<T>(
    prisma: PrismaClient,
    label: string,
    scenario: (fixture: AwardFixture) => Promise<T>
): Promise<T> {
    const suffix = `${label}-${randomUUID()}`
    const userIds: string[] = []
    const operationIds: string[] = []
    const pointRuleIds = [randomUUID(), randomUUID()]
    const createAccount = async (
        accountLabel: string,
        role: 'ADMIN' | 'AGENT' | 'USER',
        createdById?: string
    ): Promise<TestAccount> => {
        const account = await prisma.user.create({
            data: {
                username: `award-run-${accountLabel}-${suffix}`,
                email: `award-run-${accountLabel}-${suffix}@example.test`,
                passwordHash: 'integration-test',
                role,
                createdById,
            },
            select: { id: true, username: true },
        })
        userIds.push(account.id)
        return account
    }

    try {
        const admin = await createAccount('admin', 'ADMIN')
        const agentAtCompletion = await createAccount('agent-completion', 'AGENT', admin.id)
        const agentAfterTransfer = await createAccount('agent-transfer', 'AGENT', admin.id)
        const operationUser = await createAccount('user', 'USER', admin.id)
        await prisma.agentAssignment.create({
            data: {
                agentId: agentAtCompletion.id,
                userId: operationUser.id,
                sourceGroup: null,
                assignedByAdminId: admin.id,
            },
        })
        await prisma.pointRule.createMany({
            data: [
                {
                    id: pointRuleIds[0],
                    ownerType: 'AGENT_OVERRIDE',
                    ownerUserId: agentAtCompletion.id,
                    pointsPerThousand: 30,
                },
                {
                    id: pointRuleIds[1],
                    ownerType: 'AGENT_OVERRIDE',
                    ownerUserId: agentAfterTransfer.id,
                    pointsPerThousand: 90,
                },
            ],
        })

        const createOperation = async (input: CreateOperationInput = {}) => {
            const status = input.status ?? 'COMPLETED'
            const completedAt = input.completedAt === undefined
                ? status === 'COMPLETED' ? new Date('2040-01-02T12:00:00.000Z') : null
                : input.completedAt
            const operation = await prisma.operation.create({
                data: {
                    userId: operationUser.id,
                    type: 'RENEW',
                    cardNumber: `award-run-${randomUUID()}`,
                    amount: input.amount ?? 2000,
                    status,
                    completedAt,
                },
                select: { id: true, status: true, completedAt: true, amount: true },
            })
            operationIds.push(operation.id)
            return operation as Awaited<ReturnType<AwardFixture['createOperation']>>
        }

        return await scenario({
            admin,
            agentAtCompletion,
            agentAfterTransfer,
            operationUser,
            createOperation,
        })
    } finally {
        await cleanupFixture(prisma, userIds, operationIds, pointRuleIds)
    }
}

async function configurePointSettings(prisma: PrismaClient) {
    const previous = await prisma.pointProgramSettings.findUnique({
        where: { id: 'default' },
        select: {
            pointsEnabled: true,
            pointsStartAt: true,
            managerOwnedUserPointsEnabled: true,
            operationSpendSnapshotCutoverAt: true,
        },
    })
    await prisma.pointProgramSettings.upsert({
        where: { id: 'default' },
        create: {
            id: 'default',
            pointsEnabled: true,
            pointsStartAt: new Date('2000-01-01T00:00:00.000Z'),
            managerOwnedUserPointsEnabled: false,
            operationSpendSnapshotCutoverAt: null,
        },
        update: {
            pointsEnabled: true,
            pointsStartAt: new Date('2000-01-01T00:00:00.000Z'),
            managerOwnedUserPointsEnabled: false,
            operationSpendSnapshotCutoverAt: null,
        },
    })
    return async () => {
        if (previous) {
            await prisma.pointProgramSettings.update({
                where: { id: 'default' },
                data: previous,
            })
            return
        }
        await prisma.pointProgramSettings.deleteMany({ where: { id: 'default' } })
    }
}

async function currentOwnershipToken(
    prisma: PrismaClient,
    userId: string,
    buildOwnershipToken: OwnershipTokenBuilder
) {
    const [managerLinks, activeAssignments] = await Promise.all([
        prisma.managerUser.findMany({
            where: { userId },
            select: { id: true, managerId: true },
        }),
        prisma.agentAssignment.findMany({
            where: { userId, isActive: true },
            select: {
                id: true,
                agentId: true,
                updatedAt: true,
                sourceGroup: true,
                whatsappGroupUrl: true,
            },
        }),
    ])
    return buildOwnershipToken({ managerLinks, activeAssignments })
}

function positiveRecipientOwnerIds(snapshot: unknown): string[] {
    assert.ok(Array.isArray(snapshot))
    return snapshot.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
        const recipient = candidate as Record<string, unknown>
        return typeof recipient.ownerUserId === 'string'
            && typeof recipient.points === 'number'
            && recipient.points > 0
            ? [recipient.ownerUserId]
            : []
    })
}

test(
    'operation-spend award runs serialize capture and immutable finalization in PostgreSQL',
    { skip: !runDbIntegration },
    async (t) => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
        const [
            { default: prisma },
            awardRunModule,
            ownershipModule,
            ownershipLockModule,
        ] = await Promise.all([
            import('@/lib/prisma'),
            import('@/lib/points/operation-spend-award-runs'),
            import('@/lib/users/ownership-transfer'),
            import('../../shared/db/ownership-evidence-lock'),
        ])
        const captureAwardRun: CaptureAwardRun = awardRunModule.captureOperationSpendAwardRunInTransaction
        const finalizeAwardRun: FinalizeAwardRun = awardRunModule.finalizeOperationSpendAwardRun
        const transferOwnership: TransferOwnership = ownershipModule.transferUserOwnershipInTransaction
        const restorePointSettings = await configurePointSettings(prisma)

        try {
            await t.test('concurrent captures create one run and real finalization writes its recipients', async () => {
                await withAwardFixture(prisma, 'capture-finalize', async (fixture) => {
                    const operation = await fixture.createOperation()
                    const captures = await withTwoIndependentClients(async ([first, second]) => Promise.all([
                        first.$transaction((transaction) => captureAwardRun(
                            transaction,
                            operation.id,
                            'INTEGRATION_CAPTURE',
                            operation.completedAt as Date
                        )),
                        second.$transaction((transaction) => captureAwardRun(
                            transaction,
                            operation.id,
                            'INTEGRATION_CAPTURE',
                            operation.completedAt as Date
                        )),
                    ]))

                    assert.deepEqual(
                        captures.map((capture) => capture.outcome).sort(),
                        ['ALREADY_EXISTS', 'CREATED']
                    )
                    assert.equal(await prisma.operationSpendAwardRun.count({
                        where: { operationId: operation.id },
                    }), 1)

                    const finalization = await finalizeAwardRun(operation.id)
                    assert.equal(finalization.outcome, 'AWARDED')
                    const run = await prisma.operationSpendAwardRun.findUniqueOrThrow({
                        where: { operationId: operation.id },
                    })
                    const positiveOwners = positiveRecipientOwnerIds(run.recipientsSnapshot)
                    const entries = await prisma.pointLedgerEntry.findMany({
                        where: { operationSpendAwardRunId: run.id },
                        select: { ownerUserId: true },
                    })
                    assert.equal(run.status, 'AWARDED')
                    assert.equal(run.ledgerEntryCount, positiveOwners.length)
                    assert.deepEqual(
                        entries.map((entry) => entry.ownerUserId).sort(),
                        positiveOwners.sort()
                    )
                })
            })

            await t.test('two independent finalizers commit one complete ledger set', async () => {
                await withAwardFixture(prisma, 'concurrent-finalize', async (fixture) => {
                    const operation = await fixture.createOperation()
                    await prisma.$transaction((transaction) => captureAwardRun(
                        transaction,
                        operation.id,
                        'INTEGRATION_FINALIZER_RACE',
                        operation.completedAt as Date
                    ))

                    const finalizations = await withTwoIndependentClients(async ([first, second]) => Promise.all([
                        finalizeAwardRun(operation.id, first as unknown as AwardRunDatabase),
                        finalizeAwardRun(operation.id, second as unknown as AwardRunDatabase),
                    ]))
                    assert.deepEqual(
                        finalizations.map((finalization) => finalization.outcome).sort(),
                        ['ALREADY_FINALIZED', 'AWARDED']
                    )

                    const run = await prisma.operationSpendAwardRun.findUniqueOrThrow({
                        where: { operationId: operation.id },
                    })
                    assert.equal(run.status, 'AWARDED')
                    assert.equal(await prisma.pointLedgerEntry.count({
                        where: { operationSpendAwardRunId: run.id },
                    }), run.ledgerEntryCount)
                    assert.equal(new Set(finalizations.map((finalization) => finalization.runId)).size, 1)
                })
            })

            await t.test('completion owner remains authoritative after a real ownership transfer', async () => {
                await withAwardFixture(prisma, 'transfer-after-capture', async (fixture) => {
                    const operation = await fixture.createOperation()
                    await prisma.$transaction((transaction) => captureAwardRun(
                        transaction,
                        operation.id,
                        'INTEGRATION_TRANSFER_AFTER_CAPTURE',
                        operation.completedAt as Date
                    ))
                    const capturedRun = await prisma.operationSpendAwardRun.findUniqueOrThrow({
                        where: { operationId: operation.id },
                    })
                    assert.equal(capturedRun.ownershipOwnerIdSnapshot, fixture.agentAtCompletion.id)
                    assert.ok(positiveRecipientOwnerIds(capturedRun.recipientsSnapshot).includes(
                        fixture.agentAtCompletion.id
                    ))

                    const expectedOwnershipToken = await currentOwnershipToken(
                        prisma,
                        fixture.operationUser.id,
                        ownershipLockModule.buildOwnershipToken
                    )
                    await prisma.$transaction((transaction) => transferOwnership({
                        userId: fixture.operationUser.id,
                        targetOwnerType: 'AGENT',
                        targetOwnerId: fixture.agentAfterTransfer.id,
                        sourceGroup: null,
                        whatsappGroupUrl: null,
                        expectedOwnershipToken,
                        adminUserId: fixture.admin.id,
                    }, transaction))

                    assert.equal((await prisma.agentAssignment.findFirstOrThrow({
                        where: { userId: fixture.operationUser.id, isActive: true },
                        select: { agentId: true },
                    })).agentId, fixture.agentAfterTransfer.id)
                    assert.equal((await finalizeAwardRun(operation.id)).outcome, 'AWARDED')

                    const agentEntries = await prisma.pointLedgerEntry.findMany({
                        where: {
                            operationSpendAwardRunId: capturedRun.id,
                            ownerRoleAtTime: 'AGENT',
                        },
                        select: { ownerUserId: true, points: true },
                    })
                    assert.deepEqual(agentEntries, [{
                        ownerUserId: fixture.agentAtCompletion.id,
                        points: 60,
                    }])
                    assert.equal(await prisma.pointLedgerEntry.count({
                        where: {
                            operationSpendAwardRunId: capturedRun.id,
                            ownerUserId: fixture.agentAfterTransfer.id,
                        },
                    }), 0)
                })
            })

            await t.test('failure after capture rolls back both completion and its run', async () => {
                await withAwardFixture(prisma, 'capture-rollback', async (fixture) => {
                    const operation = await fixture.createOperation({ status: 'PENDING', completedAt: null })
                    const completedAt = new Date('2040-01-02T13:00:00.000Z')

                    await assert.rejects(
                        prisma.$transaction(async (transaction) => {
                            await transaction.operation.update({
                                where: { id: operation.id },
                                data: { status: 'COMPLETED', completedAt },
                            })
                            await captureAwardRun(
                                transaction,
                                operation.id,
                                'INTEGRATION_CAPTURE_ROLLBACK',
                                completedAt
                            )
                            throw new Error('INJECTED_CAPTURE_ROLLBACK')
                        }),
                        /INJECTED_CAPTURE_ROLLBACK/
                    )

                    const persistedOperation = await prisma.operation.findUniqueOrThrow({
                        where: { id: operation.id },
                        select: { status: true, completedAt: true },
                    })
                    assert.deepEqual(persistedOperation, { status: 'PENDING', completedAt: null })
                    assert.equal(await prisma.operationSpendAwardRun.count({
                        where: { operationId: operation.id },
                    }), 0)
                })
            })

            await t.test('recipient constraint failure leaves no partial ledger and keeps the run retryable', async () => {
                await withAwardFixture(prisma, 'finalize-rollback', async (fixture) => {
                    const operation = await fixture.createOperation()
                    const run = await prisma.operationSpendAwardRun.create({
                        data: {
                            operationId: operation.id,
                            policyVersion: 'operation-spend-v1',
                            completionSource: 'INTEGRATION_FINALIZE_ROLLBACK',
                            completedAtSnapshot: operation.completedAt,
                            operationTypeSnapshot: 'RENEW',
                            amountUsdSnapshot: operation.amount,
                            operationUserIdSnapshot: fixture.operationUser.id,
                            ownershipKindSnapshot: 'AGENT',
                            ownershipOwnerIdSnapshot: fixture.agentAtCompletion.id,
                            pointsEnabledSnapshot: true,
                            managerOwnedUserPointsEnabledSnapshot: false,
                            status: 'CAPTURED',
                            recipientsSnapshot: [
                                {
                                    ownerUserId: fixture.agentAtCompletion.id,
                                    ownerRole: 'AGENT',
                                    ownerKind: 'AGENT',
                                    rateBucket: 'AGENT_OVERRIDE',
                                    rateSource: 'OWNER_OVERRIDE',
                                    ruleId: null,
                                    ratePerThousand: 30,
                                    points: 60,
                                    zeroReason: null,
                                },
                                {
                                    ownerUserId: `missing-${randomUUID()}`,
                                    ownerRole: 'USER',
                                    ownerKind: 'USER',
                                    rateBucket: 'USER_GLOBAL',
                                    rateSource: 'DEFAULT',
                                    ruleId: null,
                                    ratePerThousand: 1,
                                    points: 2,
                                    zeroReason: null,
                                },
                            ],
                        },
                    })

                    await assert.rejects(() => finalizeAwardRun(operation.id))
                    assert.equal(await prisma.pointLedgerEntry.count({
                        where: { operationSpendAwardRunId: run.id },
                    }), 0)
                    let persistedRun = await prisma.operationSpendAwardRun.findUniqueOrThrow({
                        where: { id: run.id },
                        select: {
                            status: true,
                            reasonCode: true,
                            ledgerEntryCount: true,
                            finalizationAttemptCount: true,
                            lastFinalizationAttemptAt: true,
                            nextFinalizationAttemptAt: true,
                            lastFinalizationErrorCode: true,
                            finalizedAt: true,
                        },
                    })
                    assert.equal(persistedRun.status, 'CAPTURED')
                    assert.equal(persistedRun.reasonCode, null)
                    assert.equal(persistedRun.ledgerEntryCount, 0)
                    assert.equal(persistedRun.finalizationAttemptCount, 1)
                    assert.ok(persistedRun.lastFinalizationAttemptAt)
                    assert.ok(persistedRun.nextFinalizationAttemptAt)
                    assert.equal(persistedRun.lastFinalizationErrorCode, 'FINALIZATION_FAILED')
                    assert.equal(persistedRun.finalizedAt, null)

                    for (let attempt = 1; attempt < 5; attempt++) {
                        await assert.rejects(() => finalizeAwardRun(operation.id))
                    }
                    persistedRun = await prisma.operationSpendAwardRun.findUniqueOrThrow({
                        where: { id: run.id },
                        select: {
                            status: true,
                            reasonCode: true,
                            ledgerEntryCount: true,
                            finalizationAttemptCount: true,
                            lastFinalizationAttemptAt: true,
                            nextFinalizationAttemptAt: true,
                            lastFinalizationErrorCode: true,
                            finalizedAt: true,
                        },
                    })
                    assert.equal(persistedRun.status, 'LEGACY_REVIEW_REQUIRED')
                    assert.equal(persistedRun.reasonCode, 'FINALIZATION_RETRIES_EXHAUSTED')
                    assert.equal(persistedRun.finalizationAttemptCount, 5)
                    assert.equal(persistedRun.nextFinalizationAttemptAt, null)
                    assert.equal(await prisma.pointLedgerEntry.count({
                        where: { operationSpendAwardRunId: run.id },
                    }), 0)
                })
            })

            await t.test('post-cutover missing run creates one minimal review sentinel', async () => {
                await prisma.pointProgramSettings.update({
                    where: { id: 'default' },
                    data: { operationSpendSnapshotCutoverAt: new Date('2040-01-01T00:00:00.000Z') },
                })
                await withAwardFixture(prisma, 'post-cutover-sentinel', async (fixture) => {
                    const operation = await fixture.createOperation({
                        completedAt: new Date('2040-01-02T00:00:00.000Z'),
                    })
                    const finalizations = await withTwoIndependentClients(async ([first, second]) => Promise.all([
                        finalizeAwardRun(operation.id, first as unknown as AwardRunDatabase),
                        finalizeAwardRun(operation.id, second as unknown as AwardRunDatabase),
                    ]))

                    assert.deepEqual(
                        finalizations.map((finalization) => finalization.outcome),
                        ['REVIEW_REQUIRED', 'REVIEW_REQUIRED']
                    )
                    assert.equal(new Set(finalizations.map((finalization) => finalization.runId)).size, 1)
                    const sentinel = await prisma.operationSpendAwardRun.findUniqueOrThrow({
                        where: { operationId: operation.id },
                    })
                    assert.equal(sentinel.status, 'LEGACY_REVIEW_REQUIRED')
                    assert.equal(sentinel.reasonCode, 'POST_CUTOVER_MISSING_RUN')
                    assert.equal(sentinel.ownershipKindSnapshot, null)
                    assert.equal(sentinel.ownershipOwnerIdSnapshot, null)
                    assert.equal(sentinel.pointsEnabledSnapshot, null)
                    assert.equal(sentinel.ownershipEvidenceSnapshot, null)
                    assert.equal(sentinel.recipientsSnapshot, null)
                    assert.equal(await prisma.operationSpendAwardRun.count({
                        where: { operationId: operation.id },
                    }), 1)
                })
            })

            await t.test('pre-cutover missing run remains untouched and returns not found', async () => {
                await prisma.pointProgramSettings.update({
                    where: { id: 'default' },
                    data: { operationSpendSnapshotCutoverAt: new Date('2040-01-03T00:00:00.000Z') },
                })
                await withAwardFixture(prisma, 'pre-cutover-missing', async (fixture) => {
                    const operation = await fixture.createOperation({
                        completedAt: new Date('2040-01-02T00:00:00.000Z'),
                    })
                    const finalization = await finalizeAwardRun(operation.id)

                    assert.equal(finalization.outcome, 'NOT_FOUND')
                    assert.equal(finalization.reasonCode, 'PRE_CUTOVER_MISSING_RUN')
                    assert.equal(finalization.runId, null)
                    assert.equal(await prisma.operationSpendAwardRun.count({
                        where: { operationId: operation.id },
                    }), 0)
                    assert.equal(await prisma.pointLedgerEntry.count({
                        where: { operationId: operation.id },
                    }), 0)
                })
            })
        } finally {
            await restorePointSettings()
        }
    }
)
