import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { PrismaClient } from '@prisma/client'

type TransferInput = Parameters<
    typeof import('@/lib/users/ownership-transfer')['transferUserOwnershipInTransaction']
>[0]
type TransferFunction = typeof import('@/lib/users/ownership-transfer')['transferUserOwnershipInTransaction']
type OwnershipTokenBuilder = typeof import('../../shared/db/ownership-evidence-lock')['buildOwnershipToken']

type TestAccount = {
    id: string
    username: string
}

type OwnershipFixture = {
    admin: TestAccount
    agentWithDefault: TestAccount
    agentWithoutDefault: TestAccount
    otherAgent: TestAccount
    user: TestAccount
}

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1'
    || process.env.RUN_DB_INTEGRATION === 'true'

function transferError(
    expectedCode: string,
    expectedStatus: number,
    expectedToken?: string,
) {
    return (error: unknown) => {
        assert.ok(error && typeof error === 'object')
        const candidate = error as {
            code?: unknown
            status?: unknown
            currentOwnershipToken?: unknown
        }
        assert.equal(candidate.code, expectedCode)
        assert.equal(candidate.status, expectedStatus)
        if (expectedToken !== undefined) {
            assert.equal(candidate.currentOwnershipToken, expectedToken)
        }
        return true
    }
}

async function currentOwnershipToken(
    prisma: PrismaClient,
    userId: string,
    buildOwnershipToken: OwnershipTokenBuilder,
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

async function runTransfer(
    prisma: PrismaClient,
    transferUserOwnershipInTransaction: TransferFunction,
    input: TransferInput,
) {
    return prisma.$transaction((tx) => transferUserOwnershipInTransaction(input, tx))
}

async function cleanupFixture(prisma: PrismaClient, userIds: string[]) {
    if (userIds.length === 0) return

    await prisma.pointLedgerEntry.deleteMany({
        where: {
            OR: [
                { ownerUserId: { in: userIds } },
                { createdById: { in: userIds } },
                { releasedByAdminId: { in: userIds } },
            ],
        },
    })
    await prisma.creditDebtLedgerEntry.deleteMany({
        where: {
            OR: [
                { userId: { in: userIds } },
                { recordedByUserId: { in: userIds } },
            ],
        },
    })
    await prisma.creditRequest.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.transaction.deleteMany({
        where: {
            OR: [
                { userId: { in: userIds } },
                { adminId: { in: userIds } },
            ],
        },
    })
    await prisma.operation.deleteMany({ where: { userId: { in: userIds } } })
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
    await prisma.agentProfile.deleteMany({ where: { agentId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function withOwnershipFixture<T>(
    prisma: PrismaClient,
    label: string,
    scenario: (fixture: OwnershipFixture) => Promise<T>,
) {
    const suffix = `${label}-${randomUUID()}`
    const userIds: string[] = []
    const createAccount = async (
        accountLabel: string,
        role: 'ADMIN' | 'AGENT' | 'USER',
        financial = false,
    ): Promise<TestAccount> => {
        const account = await prisma.user.create({
            data: {
                username: `ownership-${accountLabel}-${suffix}`,
                email: `ownership-${accountLabel}-${suffix}@example.test`,
                passwordHash: 'integration-test',
                role,
                ...(financial ? {
                    balance: 321.75,
                    creditDebtLimitUsd: 500,
                    lowBalanceAlert: 19.5,
                    totalOperations: 7,
                } : {}),
            },
            select: { id: true, username: true },
        })
        userIds.push(account.id)
        return account
    }

    try {
        const admin = await createAccount('admin', 'ADMIN')
        const agentWithDefault = await createAccount('agent-default', 'AGENT')
        const agentWithoutDefault = await createAccount('agent-empty', 'AGENT')
        const otherAgent = await createAccount('agent-other', 'AGENT')
        const user = await createAccount('user', 'USER', true)

        await prisma.agentProfile.createMany({
            data: [
                {
                    agentId: agentWithDefault.id,
                    defaultSourceGroup: 'Fixture Default Group',
                },
                { agentId: agentWithoutDefault.id, defaultSourceGroup: null },
                { agentId: otherAgent.id, defaultSourceGroup: 'Other Agent Default' },
            ],
        })

        return await scenario({
            admin,
            agentWithDefault,
            agentWithoutDefault,
            otherAgent,
            user,
        })
    } finally {
        await cleanupFixture(prisma, userIds)
    }
}

async function financialSnapshot(prisma: PrismaClient, userId: string) {
    const [user, operations, transactions, pointEntries, creditRequests, debtEntries] = await Promise.all([
        prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
                balance: true,
                creditDebtLimitUsd: true,
                lowBalanceAlert: true,
                totalOperations: true,
            },
        }),
        prisma.operation.findMany({
            where: { userId },
            select: {
                id: true,
                userId: true,
                type: true,
                amount: true,
                status: true,
                completedAt: true,
            },
            orderBy: { id: 'asc' },
        }),
        prisma.transaction.findMany({
            where: { userId },
            select: {
                id: true,
                userId: true,
                adminId: true,
                operationId: true,
                amount: true,
                balanceAfter: true,
                type: true,
                notes: true,
            },
            orderBy: { id: 'asc' },
        }),
        prisma.pointLedgerEntry.findMany({
            where: { ownerUserId: userId },
            select: {
                id: true,
                ownerUserId: true,
                ownerRoleAtTime: true,
                sourceType: true,
                sourceId: true,
                points: true,
                status: true,
            },
            orderBy: { id: 'asc' },
        }),
        prisma.creditRequest.findMany({
            where: { userId },
            select: {
                id: true,
                requestNumber: true,
                amountUsd: true,
                status: true,
                agentIdSnapshot: true,
                sourceGroupSnapshot: true,
                whatsappGroupUrlSnapshot: true,
                ownerTypeSnapshot: true,
                ownerIdSnapshot: true,
            },
            orderBy: { id: 'asc' },
        }),
        prisma.creditDebtLedgerEntry.findMany({
            where: { userId },
            select: {
                id: true,
                userId: true,
                entryType: true,
                amountUsd: true,
                debtAfterUsd: true,
                creditRequestId: true,
                transactionId: true,
                ownerTypeSnapshot: true,
                ownerIdSnapshot: true,
            },
            orderBy: { id: 'asc' },
        }),
    ])

    return { user, operations, transactions, pointEntries, creditRequests, debtEntries }
}

async function createIndependentPrismaClient(): Promise<PrismaClient> {
    const [{ PrismaClient }, { PrismaPg }, pgModule] = await Promise.all([
        import('@prisma/client'),
        import('@prisma/adapter-pg'),
        import('pg'),
    ])
    const pool = new pgModule.default.Pool({ connectionString: process.env.DATABASE_URL })
    return new PrismaClient({ adapter: new PrismaPg(pool) })
}

test(
    'canonical ownership transfer preserves data and serializes PostgreSQL mutations',
    { skip: !runDbIntegration },
    async (t) => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')

        const [{ default: prisma }, ownershipModule, lockModule] = await Promise.all([
            import('@/lib/prisma'),
            import('@/lib/users/ownership-transfer'),
            import('../../shared/db/ownership-evidence-lock'),
        ])
        const { transferUserOwnershipInTransaction } = ownershipModule
        const { buildOwnershipToken } = lockModule

        await t.test('preserves non-zero financial state and historical snapshots with null Source Group', async () => {
            await withOwnershipFixture(prisma, 'financial-null', async (fixture) => {
                const operation = await prisma.operation.create({
                    data: {
                        userId: fixture.user.id,
                        type: 'RENEW',
                        cardNumber: `ownership-${randomUUID()}`,
                        amount: 87.5,
                        status: 'COMPLETED',
                        completedAt: new Date('2026-08-01T12:00:00.000Z'),
                    },
                })
                const transaction = await prisma.transaction.create({
                    data: {
                        userId: fixture.user.id,
                        adminId: fixture.admin.id,
                        operationId: operation.id,
                        amount: 321.75,
                        balanceAfter: 321.75,
                        type: 'DEPOSIT',
                        notes: 'financial invariant fixture',
                    },
                })
                const creditRequest = await prisma.creditRequest.create({
                    data: {
                        requestNumber: `OWN-${randomUUID()}`,
                        userId: fixture.user.id,
                        usernameSnapshot: fixture.user.username,
                        amountUsd: 45,
                        paymentMethod: 'integration-test',
                        agentIdSnapshot: fixture.agentWithDefault.id,
                        agentNameSnapshot: fixture.agentWithDefault.username,
                        sourceGroupSnapshot: 'Historical Group',
                        whatsappGroupUrlSnapshot: 'https://chat.whatsapp.com/historical-fixture',
                        ownerTypeSnapshot: 'AGENT',
                        ownerIdSnapshot: fixture.agentWithDefault.id,
                        ownerLabelSnapshot: fixture.agentWithDefault.username,
                        status: 'APPROVED',
                        decidedAt: new Date('2026-08-01T13:00:00.000Z'),
                        decidedByAdminId: fixture.admin.id,
                        transactionId: transaction.id,
                    },
                })
                await prisma.creditDebtLedgerEntry.create({
                    data: {
                        userId: fixture.user.id,
                        entryType: 'CREDIT_APPROVED',
                        amountUsd: 45,
                        debtAfterUsd: 45,
                        creditRequestId: creditRequest.id,
                        transactionId: transaction.id,
                        ownerTypeSnapshot: 'ADMIN',
                        ownerIdSnapshot: fixture.admin.id,
                        ownerLabelSnapshot: fixture.admin.username,
                        recordedByUserId: fixture.admin.id,
                    },
                })
                await prisma.pointLedgerEntry.create({
                    data: {
                        ownerUserId: fixture.user.id,
                        ownerRoleAtTime: 'USER',
                        sourceType: 'ADMIN_ADJUSTMENT',
                        sourceId: `ownership-financial-${randomUUID()}`,
                        points: 7.25,
                        status: 'AVAILABLE',
                        createdById: fixture.admin.id,
                    },
                })
                await prisma.managerUser.create({
                    data: { managerId: fixture.admin.id, userId: fixture.user.id },
                })

                const before = await financialSnapshot(prisma, fixture.user.id)
                const result = await runTransfer(prisma, transferUserOwnershipInTransaction, {
                    userId: fixture.user.id,
                    targetOwnerType: 'AGENT',
                    targetOwnerId: fixture.agentWithoutDefault.id,
                    sourceGroup: null,
                    whatsappGroupUrl: null,
                    expectedOwnershipToken: await currentOwnershipToken(
                        prisma,
                        fixture.user.id,
                        buildOwnershipToken,
                    ),
                    adminUserId: fixture.admin.id,
                })
                const after = await financialSnapshot(prisma, fixture.user.id)

                assert.equal(result.mode, 'REPLACED')
                assert.equal(result.agentAssignment?.sourceGroup, null)
                assert.equal(result.agentAssignment?.whatsappGroupUrl, null)
                assert.equal(result.sourceGroupResolution, 'CLEARED')
                assert.deepEqual(after, before)
            })
        })

        await t.test('applies agent default, explicit metadata, and explicit clearing in place', async () => {
            await withOwnershipFixture(prisma, 'source-group-modes', async (fixture) => {
                const initialToken = await currentOwnershipToken(
                    prisma,
                    fixture.user.id,
                    buildOwnershipToken,
                )
                const created = await runTransfer(prisma, transferUserOwnershipInTransaction, {
                    userId: fixture.user.id,
                    targetOwnerType: 'AGENT',
                    targetOwnerId: fixture.agentWithDefault.id,
                    expectedOwnershipToken: initialToken,
                    adminUserId: fixture.admin.id,
                })

                assert.equal(created.mode, 'CREATED')
                assert.equal(created.agentAssignment?.sourceGroup, 'Fixture Default Group')
                assert.equal(created.sourceGroupResolution, 'AGENT_DEFAULT')

                const explicitUrl = 'https://chat.whatsapp.com/explicit-fixture'
                const explicitlyUpdated = await runTransfer(
                    prisma,
                    transferUserOwnershipInTransaction,
                    {
                        userId: fixture.user.id,
                        targetOwnerType: 'AGENT',
                        targetOwnerId: fixture.agentWithDefault.id,
                        sourceGroup: '  Manual Group  ',
                        whatsappGroupUrl: `  ${explicitUrl}  `,
                        expectedOwnershipToken: created.ownershipToken,
                        adminUserId: fixture.admin.id,
                    },
                )

                assert.equal(explicitlyUpdated.mode, 'UPDATED')
                assert.equal(explicitlyUpdated.agentAssignment?.id, created.agentAssignment?.id)
                assert.equal(explicitlyUpdated.agentAssignment?.sourceGroup, 'Manual Group')
                assert.equal(explicitlyUpdated.agentAssignment?.whatsappGroupUrl, explicitUrl)
                assert.equal(explicitlyUpdated.sourceGroupResolution, 'EXPLICIT')
                assert.equal(explicitlyUpdated.whatsappGroupUrlResolution, 'EXPLICIT')

                const cleared = await runTransfer(prisma, transferUserOwnershipInTransaction, {
                    userId: fixture.user.id,
                    targetOwnerType: 'AGENT',
                    targetOwnerId: fixture.agentWithDefault.id,
                    sourceGroup: '   ',
                    expectedOwnershipToken: explicitlyUpdated.ownershipToken,
                    adminUserId: fixture.admin.id,
                })

                assert.equal(cleared.mode, 'UPDATED')
                assert.equal(cleared.agentAssignment?.id, created.agentAssignment?.id)
                assert.equal(cleared.agentAssignment?.sourceGroup, null)
                assert.equal(cleared.agentAssignment?.whatsappGroupUrl, explicitUrl)
                assert.equal(cleared.sourceGroupResolution, 'CLEARED')
                assert.equal(cleared.whatsappGroupUrlResolution, 'PRESERVED')

                const audits = await prisma.activityLog.findMany({
                    where: {
                        action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
                        targetId: fixture.user.id,
                    },
                    select: { details: true },
                })
                assert.equal(audits.length, 3)
                assert.equal(JSON.stringify(audits).includes(explicitUrl), false)
            })
        })

        await t.test('returns a true no-op for the same agent and unchanged metadata', async () => {
            await withOwnershipFixture(prisma, 'same-agent-noop', async (fixture) => {
                const assignment = await prisma.agentAssignment.create({
                    data: {
                        userId: fixture.user.id,
                        agentId: fixture.agentWithDefault.id,
                        sourceGroup: 'Preserved Group',
                        whatsappGroupUrl: 'https://chat.whatsapp.com/preserved-fixture',
                        assignedByAdminId: fixture.admin.id,
                    },
                })
                const result = await runTransfer(prisma, transferUserOwnershipInTransaction, {
                    userId: fixture.user.id,
                    targetOwnerType: 'AGENT',
                    targetOwnerId: fixture.agentWithDefault.id,
                    expectedOwnershipToken: await currentOwnershipToken(
                        prisma,
                        fixture.user.id,
                        buildOwnershipToken,
                    ),
                    adminUserId: fixture.admin.id,
                })

                assert.equal(result.mode, 'NO_OP')
                assert.equal(result.auditLogId, null)
                assert.equal(result.agentAssignment?.id, assignment.id)
                assert.equal(result.sourceGroupResolution, 'PRESERVED')
                assert.equal(result.whatsappGroupUrlResolution, 'PRESERVED')
                assert.equal(await prisma.agentAssignment.count({ where: { userId: fixture.user.id } }), 1)
                assert.equal(await prisma.activityLog.count({
                    where: {
                        action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
                        targetId: fixture.user.id,
                    },
                }), 0)
            })
        })

        await t.test('does not inherit Source Group or WhatsApp metadata across agents', async () => {
            await withOwnershipFixture(prisma, 'different-agent', async (fixture) => {
                const oldUrl = 'https://chat.whatsapp.com/old-agent-fixture'
                const oldAssignment = await prisma.agentAssignment.create({
                    data: {
                        userId: fixture.user.id,
                        agentId: fixture.agentWithDefault.id,
                        sourceGroup: 'Old Agent Group',
                        whatsappGroupUrl: oldUrl,
                        assignedByAdminId: fixture.admin.id,
                    },
                })
                const result = await runTransfer(prisma, transferUserOwnershipInTransaction, {
                    userId: fixture.user.id,
                    targetOwnerType: 'AGENT',
                    targetOwnerId: fixture.agentWithoutDefault.id,
                    expectedOwnershipToken: await currentOwnershipToken(
                        prisma,
                        fixture.user.id,
                        buildOwnershipToken,
                    ),
                    adminUserId: fixture.admin.id,
                })

                assert.equal(result.mode, 'REPLACED')
                assert.equal(result.agentAssignment?.sourceGroup, null)
                assert.equal(result.agentAssignment?.whatsappGroupUrl, null)
                assert.equal(result.sourceGroupResolution, 'NONE')
                assert.equal(result.whatsappGroupUrlResolution, 'NONE')
                assert.notEqual(result.agentAssignment?.id, oldAssignment.id)

                const assignments = await prisma.agentAssignment.findMany({
                    where: { userId: fixture.user.id },
                    orderBy: { createdAt: 'asc' },
                })
                assert.equal(assignments.filter((item) => item.isActive).length, 1)
                const historical = assignments.find((item) => item.id === oldAssignment.id)
                assert.equal(historical?.isActive, false)
                assert.ok(historical?.endedAt)
                assert.equal(historical?.sourceGroup, 'Old Agent Group')
                assert.equal(historical?.whatsappGroupUrl, oldUrl)
            })
        })

        await t.test('audit records previous owner ids as well as ownership row ids', async () => {
            await withOwnershipFixture(prisma, 'audit-owner-ids', async (fixture) => {
                const managerLink = await prisma.managerUser.create({
                    data: { managerId: fixture.admin.id, userId: fixture.user.id },
                })
                const oldAssignment = await prisma.agentAssignment.create({
                    data: {
                        userId: fixture.user.id,
                        agentId: fixture.agentWithDefault.id,
                        sourceGroup: 'Historical Group',
                        assignedByAdminId: fixture.admin.id,
                    },
                })
                const transferred = await runTransfer(
                    prisma,
                    transferUserOwnershipInTransaction,
                    {
                        userId: fixture.user.id,
                        targetOwnerType: 'AGENT',
                        targetOwnerId: fixture.otherAgent.id,
                        expectedOwnershipToken: await currentOwnershipToken(
                            prisma,
                            fixture.user.id,
                            buildOwnershipToken,
                        ),
                        adminUserId: fixture.admin.id,
                    },
                )
                const audit = await prisma.activityLog.findUniqueOrThrow({
                    where: { id: transferred.auditLogId! },
                    select: { details: true },
                })
                const details = audit.details as Record<string, unknown>

                assert.deepEqual(details.previousManagerOwnerIds, [fixture.admin.id])
                assert.deepEqual(details.previousAgentOwnerIds, [fixture.agentWithDefault.id])
                assert.deepEqual(details.managerUserIdsRemoved, [managerLink.id])
                assert.deepEqual(details.activeAssignmentIdsClosed, [oldAssignment.id])
            })
        })

        await t.test('enforces missing and stale tokens while accepting an identical duplicate', async () => {
            await withOwnershipFixture(prisma, 'preconditions', async (fixture) => {
                await assert.rejects(
                    runTransfer(prisma, transferUserOwnershipInTransaction, {
                        userId: fixture.user.id,
                        targetOwnerType: 'AGENT',
                        targetOwnerId: fixture.agentWithDefault.id,
                        adminUserId: fixture.admin.id,
                    }),
                    transferError('OWNERSHIP_PRECONDITION_REQUIRED', 428),
                )
                assert.equal(await prisma.agentAssignment.count({ where: { userId: fixture.user.id } }), 0)

                const initialToken = await currentOwnershipToken(
                    prisma,
                    fixture.user.id,
                    buildOwnershipToken,
                )
                const request = {
                    userId: fixture.user.id,
                    targetOwnerType: 'AGENT' as const,
                    targetOwnerId: fixture.agentWithDefault.id,
                    sourceGroup: 'Stable Group',
                    whatsappGroupUrl: null,
                    expectedOwnershipToken: initialToken,
                    adminUserId: fixture.admin.id,
                }
                const first = await runTransfer(
                    prisma,
                    transferUserOwnershipInTransaction,
                    request,
                )
                const duplicate = await runTransfer(
                    prisma,
                    transferUserOwnershipInTransaction,
                    request,
                )

                assert.equal(first.mode, 'CREATED')
                assert.equal(duplicate.mode, 'NO_OP')
                assert.equal(duplicate.auditLogId, null)
                assert.equal(duplicate.agentAssignment?.id, first.agentAssignment?.id)

                await assert.rejects(
                    runTransfer(prisma, transferUserOwnershipInTransaction, {
                        userId: fixture.user.id,
                        targetOwnerType: 'AGENT',
                        targetOwnerId: fixture.otherAgent.id,
                        sourceGroup: 'Different State',
                        expectedOwnershipToken: initialToken,
                        adminUserId: fixture.admin.id,
                    }),
                    transferError('OWNERSHIP_CHANGED', 409, first.ownershipToken),
                )

                const activeAssignments = await prisma.agentAssignment.findMany({
                    where: { userId: fixture.user.id, isActive: true },
                })
                assert.equal(activeAssignments.length, 1)
                assert.equal(activeAssignments[0].agentId, fixture.agentWithDefault.id)
                assert.equal(await prisma.activityLog.count({
                    where: {
                        action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
                        targetId: fixture.user.id,
                    },
                }), 1)
            })
        })

        await t.test('rolls back assignment cleanup, replacement, and audit together', async () => {
            await withOwnershipFixture(prisma, 'rollback', async (fixture) => {
                const oldAssignment = await prisma.agentAssignment.create({
                    data: {
                        userId: fixture.user.id,
                        agentId: fixture.agentWithDefault.id,
                        sourceGroup: 'Rollback Group',
                        whatsappGroupUrl: 'https://chat.whatsapp.com/rollback-fixture',
                        assignedByAdminId: fixture.admin.id,
                    },
                })
                const initialToken = await currentOwnershipToken(
                    prisma,
                    fixture.user.id,
                    buildOwnershipToken,
                )
                let observedMode: string | undefined

                await assert.rejects(
                    prisma.$transaction(async (tx) => {
                        const result = await transferUserOwnershipInTransaction({
                            userId: fixture.user.id,
                            targetOwnerType: 'AGENT',
                            targetOwnerId: fixture.agentWithoutDefault.id,
                            sourceGroup: null,
                            expectedOwnershipToken: initialToken,
                            adminUserId: fixture.admin.id,
                        }, tx)
                        observedMode = result.mode
                        throw new Error('INJECTED_TRANSFER_ROLLBACK')
                    }),
                    /INJECTED_TRANSFER_ROLLBACK/,
                )

                assert.equal(observedMode, 'REPLACED')
                const assignments = await prisma.agentAssignment.findMany({
                    where: { userId: fixture.user.id },
                })
                assert.equal(assignments.length, 1)
                assert.equal(assignments[0].id, oldAssignment.id)
                assert.equal(assignments[0].isActive, true)
                assert.equal(assignments[0].endedAt, null)
                assert.equal(
                    await currentOwnershipToken(prisma, fixture.user.id, buildOwnershipToken),
                    initialToken,
                )
                assert.equal(await prisma.activityLog.count({
                    where: {
                        action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
                        targetId: fixture.user.id,
                    },
                }), 0)
            })
        })

        await t.test('serializes identical concurrent requests as one mutation plus one no-op', async () => {
            await withOwnershipFixture(prisma, 'concurrent-identical', async (fixture) => {
                const [clientA, clientB] = await Promise.all([
                    createIndependentPrismaClient(),
                    createIndependentPrismaClient(),
                ])
                try {
                    const initialToken = await currentOwnershipToken(
                        prisma,
                        fixture.user.id,
                        buildOwnershipToken,
                    )
                    const request = {
                        userId: fixture.user.id,
                        targetOwnerType: 'AGENT' as const,
                        targetOwnerId: fixture.agentWithDefault.id,
                        sourceGroup: 'Concurrent Group',
                        whatsappGroupUrl: null,
                        expectedOwnershipToken: initialToken,
                        adminUserId: fixture.admin.id,
                    }
                    const results = await Promise.all([
                        runTransfer(clientA, transferUserOwnershipInTransaction, request),
                        runTransfer(clientB, transferUserOwnershipInTransaction, request),
                    ])

                    assert.deepEqual(results.map((result) => result.mode).sort(), ['CREATED', 'NO_OP'])
                    assert.equal(results.filter((result) => result.auditLogId !== null).length, 1)
                    assert.equal(await prisma.agentAssignment.count({
                        where: { userId: fixture.user.id, isActive: true },
                    }), 1)
                    assert.equal(await prisma.activityLog.count({
                        where: {
                            action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
                            targetId: fixture.user.id,
                        },
                    }), 1)
                } finally {
                    await Promise.allSettled([clientA.$disconnect(), clientB.$disconnect()])
                }
            })
        })

        await t.test('serializes competing concurrent requests as one winner plus stale conflict', async () => {
            await withOwnershipFixture(prisma, 'concurrent-different', async (fixture) => {
                const [clientA, clientB] = await Promise.all([
                    createIndependentPrismaClient(),
                    createIndependentPrismaClient(),
                ])
                try {
                    const initialToken = await currentOwnershipToken(
                        prisma,
                        fixture.user.id,
                        buildOwnershipToken,
                    )
                    const settled = await Promise.allSettled([
                        runTransfer(clientA, transferUserOwnershipInTransaction, {
                            userId: fixture.user.id,
                            targetOwnerType: 'AGENT',
                            targetOwnerId: fixture.agentWithDefault.id,
                            sourceGroup: 'Race A',
                            expectedOwnershipToken: initialToken,
                            adminUserId: fixture.admin.id,
                        }),
                        runTransfer(clientB, transferUserOwnershipInTransaction, {
                            userId: fixture.user.id,
                            targetOwnerType: 'AGENT',
                            targetOwnerId: fixture.otherAgent.id,
                            sourceGroup: 'Race B',
                            expectedOwnershipToken: initialToken,
                            adminUserId: fixture.admin.id,
                        }),
                    ])
                    const fulfilled = settled.filter(
                        (result): result is PromiseFulfilledResult<Awaited<ReturnType<TransferFunction>>> => (
                            result.status === 'fulfilled'
                        ),
                    )
                    const rejected = settled.filter(
                        (result): result is PromiseRejectedResult => result.status === 'rejected',
                    )

                    assert.equal(fulfilled.length, 1)
                    assert.equal(rejected.length, 1)
                    assert.equal(fulfilled[0].value.mode, 'CREATED')
                    transferError(
                        'OWNERSHIP_CHANGED',
                        409,
                        fulfilled[0].value.ownershipToken,
                    )(rejected[0].reason)

                    const activeAssignments = await prisma.agentAssignment.findMany({
                        where: { userId: fixture.user.id, isActive: true },
                    })
                    assert.equal(activeAssignments.length, 1)
                    assert.equal(activeAssignments[0].agentId, fulfilled[0].value.newOwnerId)
                    assert.equal(await prisma.activityLog.count({
                        where: {
                            action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
                            targetId: fixture.user.id,
                        },
                    }), 1)
                } finally {
                    await Promise.allSettled([clientA.$disconnect(), clientB.$disconnect()])
                }
            })
        })
    },
)
