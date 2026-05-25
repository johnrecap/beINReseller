import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

async function createUser(
    prisma: Awaited<typeof import('@/lib/prisma')>['default'],
    suffix: string,
    role: 'ADMIN' | 'MANAGER' | 'AGENT' | 'USER' = 'USER'
) {
    return prisma.user.create({
        data: {
            username: `agent-transfer-${suffix}-${role.toLowerCase()}`,
            email: `agent-transfer-${suffix}-${role.toLowerCase()}@example.test`,
            passwordHash: 'test',
            role,
        },
    })
}

test('transfers manager-owned user to agent ownership', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { transferUserToAgent } = await import('@/lib/agents/assignment-transfer')
    const suffix = `${Date.now()}-manager`
    const admin = await createUser(prisma, suffix, 'ADMIN')
    const manager = await createUser(prisma, suffix, 'MANAGER')
    const agent = await createUser(prisma, suffix, 'AGENT')
    const user = await createUser(prisma, suffix, 'USER')
    const managerLink = await prisma.managerUser.create({
        data: { managerId: manager.id, userId: user.id },
    })

    try {
        const result = await transferUserToAgent({
            userId: user.id,
            agentId: agent.id,
            sourceGroup: 'group-a',
            replaceExisting: true,
            adminUserId: admin.id,
            ipAddress: 'test',
        })

        assert.equal(result.transfer.mode, 'transferred')
        assert.deepEqual(result.transfer.previousManagerOwnerIds, [manager.id])

        const managerRows = await prisma.managerUser.findMany({ where: { userId: user.id } })
        assert.equal(managerRows.length, 0)

        const activeAssignments = await prisma.agentAssignment.findMany({
            where: { userId: user.id, isActive: true },
        })
        assert.equal(activeAssignments.length, 1)
        assert.equal(activeAssignments[0].agentId, agent.id)
    } finally {
        await prisma.activityLog.deleteMany({ where: { userId: admin.id } })
        await prisma.agentAssignment.deleteMany({ where: { userId: user.id } })
        await prisma.managerUser.deleteMany({ where: { id: managerLink.id } })
        await prisma.user.deleteMany({ where: { id: { in: [admin.id, manager.id, agent.id, user.id] } } })
    }
})

test('reassigns agent-owned user to another agent', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { transferUserToAgent } = await import('@/lib/agents/assignment-transfer')
    const suffix = `${Date.now()}-agent`
    const admin = await createUser(prisma, suffix, 'ADMIN')
    const oldAgent = await createUser(prisma, suffix, 'AGENT')
    const newAgent = await createUser(prisma, `${suffix}-new`, 'AGENT')
    const user = await createUser(prisma, suffix, 'USER')
    const oldAssignment = await prisma.agentAssignment.create({
        data: {
            userId: user.id,
            agentId: oldAgent.id,
            sourceGroup: 'old-group',
            assignedByAdminId: admin.id,
        },
    })

    try {
        const result = await transferUserToAgent({
            userId: user.id,
            agentId: newAgent.id,
            sourceGroup: 'new-group',
            replaceExisting: true,
            adminUserId: admin.id,
            ipAddress: 'test',
        })

        assert.equal(result.transfer.mode, 'transferred')
        assert.deepEqual(result.transfer.previousAgentAssignmentIds, [oldAssignment.id])

        const assignments = await prisma.agentAssignment.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' },
        })
        assert.equal(assignments.filter((item) => item.isActive).length, 1)
        assert.equal(assignments.find((item) => item.id === oldAssignment.id)?.isActive, false)
        assert.equal(assignments.find((item) => item.isActive)?.agentId, newAgent.id)
    } finally {
        await prisma.activityLog.deleteMany({ where: { userId: admin.id } })
        await prisma.agentAssignment.deleteMany({ where: { userId: user.id } })
        await prisma.user.deleteMany({ where: { id: { in: [admin.id, oldAgent.id, newAgent.id, user.id] } } })
    }
})
