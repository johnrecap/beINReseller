import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentOwnedUserFilter } from '@/lib/admin/users-ownership-filter'

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

test('agent user filter returns only active non-deleted assignments', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const suffix = `${Date.now()}-filter`
    const agent = await createUser(prisma, suffix, 'AGENT')
    const otherAgent = await createUser(prisma, `${suffix}-other`, 'AGENT')
    const emptyAgent = await createUser(prisma, `${suffix}-empty`, 'AGENT')
    const activeUser = await createUser(prisma, `${suffix}-active`, 'USER')
    const inactiveUser = await createUser(prisma, `${suffix}-inactive`, 'USER')
    const otherAgentUser = await createUser(prisma, `${suffix}-other-agent`, 'USER')
    const deletedUser = await createUser(prisma, `${suffix}-deleted`, 'USER')
    const userIds = [activeUser.id, inactiveUser.id, otherAgentUser.id, deletedUser.id]

    try {
        await prisma.agentAssignment.createMany({
            data: [
                {
                    userId: activeUser.id,
                    agentId: agent.id,
                    sourceGroup: 'active-group',
                },
                {
                    userId: inactiveUser.id,
                    agentId: agent.id,
                    sourceGroup: 'inactive-group',
                    isActive: false,
                    endedAt: new Date(),
                },
                {
                    userId: otherAgentUser.id,
                    agentId: otherAgent.id,
                    sourceGroup: 'other-agent-group',
                },
                {
                    userId: deletedUser.id,
                    agentId: agent.id,
                    sourceGroup: 'deleted-user-group',
                },
            ],
        })
        await prisma.user.update({
            where: { id: deletedUser.id },
            data: { deletedAt: new Date() },
        })

        const filteredUsers = await prisma.user.findMany({
            where: {
                role: 'USER',
                deletedAt: null,
                ...buildAgentOwnedUserFilter(agent.id),
            },
            select: { id: true },
        })
        const assignedUsersCount = await prisma.agentAssignment.count({
            where: {
                agentId: agent.id,
                isActive: true,
                user: { role: 'USER', deletedAt: null },
            },
        })
        const emptyAgentUsers = await prisma.user.findMany({
            where: {
                role: 'USER',
                deletedAt: null,
                ...buildAgentOwnedUserFilter(emptyAgent.id),
            },
            select: { id: true },
        })
        const emptyAgentUsersCount = await prisma.agentAssignment.count({
            where: {
                agentId: emptyAgent.id,
                isActive: true,
                user: { role: 'USER', deletedAt: null },
            },
        })

        assert.deepEqual(filteredUsers.map((user) => user.id), [activeUser.id])
        assert.equal(assignedUsersCount, filteredUsers.length)
        assert.deepEqual(emptyAgentUsers, [])
        assert.equal(emptyAgentUsersCount, emptyAgentUsers.length)
    } finally {
        await prisma.agentAssignment.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.user.deleteMany({
            where: { id: { in: [agent.id, otherAgent.id, emptyAgent.id, ...userIds] } },
        })
    }
})
