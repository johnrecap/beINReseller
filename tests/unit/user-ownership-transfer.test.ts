import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildOwnershipTransferErrorPayload,
    buildOwnershipTransferPlan,
    buildSafeCurrentOwnershipSummary,
    mapOwnershipMutationError,
    validateOwnershipTransferTargets,
} from '@/lib/users/ownership-transfer'

const activeUser = {
    id: 'user-1',
    role: 'USER',
    isActive: true,
    deletedAt: null,
}

const admin = {
    id: 'admin-1',
    username: 'admin',
    role: 'ADMIN',
    isActive: true,
    deletedAt: null,
}

const manager = {
    id: 'manager-1',
    username: 'manager',
    role: 'MANAGER',
    isActive: true,
    deletedAt: null,
}

const agent = {
    id: 'agent-1',
    username: 'agent',
    role: 'AGENT',
    isActive: true,
    deletedAt: null,
    agentProfile: { defaultSourceGroup: 'agent-default', isActive: true },
}

const buildConcurrentOwnershipPlan = buildOwnershipTransferPlan as unknown as (input: {
    userId: string
    targetOwnerType: 'ADMIN' | 'MANAGER' | 'AGENT'
    targetOwnerId: string
    managerUserIds?: string[]
    managerLinks?: Array<{ id: string; managerId: string }>
    activeAssignments?: Array<{
        id: string
        agentId: string
        sourceGroup: string | null
        whatsappGroupUrl: string | null
    }>
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    agentDefaultSourceGroup?: string | null
    expectedOwnershipToken?: string
    currentOwnershipToken: string
}) => Record<string, unknown>

test('validates target user and expected target owner role', () => {
    assert.deepEqual(validateOwnershipTransferTargets({
        user: activeUser,
        targetOwner: admin,
        targetOwnerType: 'ADMIN',
    }), { ok: true })

    assert.deepEqual(validateOwnershipTransferTargets({
        user: activeUser,
        targetOwner: manager,
        targetOwnerType: 'ADMIN',
    }), { ok: false, code: 'INVALID_TARGET_OWNER', status: 400 })

    assert.deepEqual(validateOwnershipTransferTargets({
        user: { ...activeUser, isActive: false },
        targetOwner: admin,
        targetOwnerType: 'ADMIN',
    }), { ok: false, code: 'INVALID_TARGET_USER', status: 400 })
})

test('builds admin target plan that closes active assignments and removes manager links', () => {
    const plan = buildOwnershipTransferPlan({
        userId: 'user-1',
        targetOwnerType: 'ADMIN',
        targetOwnerId: 'admin-1',
        managerUserIds: ['link-1', 'link-2'],
        activeAssignments: [{ id: 'assignment-1', agentId: 'agent-1' }],
    })

    assert.deepEqual(plan, {
        userId: 'user-1',
        targetOwnerType: 'ADMIN',
        targetOwnerId: 'admin-1',
        managerUserIdsToRemove: ['link-1', 'link-2'],
        activeAssignmentIdsToClose: ['assignment-1'],
        requiresAgentAssignmentCreate: false,
        requiresManagerLinkCreate: true,
        replacedOwnership: true,
    })
})

test('builds manager target plan for agent-owned user', () => {
    const plan = buildOwnershipTransferPlan({
        userId: 'user-1',
        targetOwnerType: 'MANAGER',
        targetOwnerId: 'manager-1',
        managerUserIds: [],
        activeAssignments: [{ id: 'assignment-1', agentId: 'agent-1' }],
    })

    assert.equal(plan.targetOwnerType, 'MANAGER')
    assert.deepEqual(plan.activeAssignmentIdsToClose, ['assignment-1'])
    assert.equal(plan.requiresManagerLinkCreate, true)
    assert.equal(plan.requiresAgentAssignmentCreate, false)
})

test('builds agent target plan for admin-owned user', () => {
    const plan = buildOwnershipTransferPlan({
        userId: 'user-1',
        targetOwnerType: 'AGENT',
        targetOwnerId: 'agent-1',
        managerUserIds: ['admin-link'],
        activeAssignments: [],
    })

    assert.equal(plan.targetOwnerType, 'AGENT')
    assert.deepEqual(plan.managerUserIdsToRemove, ['admin-link'])
    assert.equal(plan.requiresManagerLinkCreate, false)
    assert.equal(plan.requiresAgentAssignmentCreate, true)
})

test('exact desired state becomes NO_OP before stale-token rejection', () => {
    const plan = buildConcurrentOwnershipPlan({
        userId: 'user-1',
        targetOwnerType: 'AGENT',
        targetOwnerId: 'agent-1',
        managerUserIds: [],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: 'current-group',
                whatsappGroupUrl: 'https://chat.whatsapp.com/current',
            },
        ],
        expectedOwnershipToken: 'ow1.stale-identical-request',
        currentOwnershipToken: 'ow1.current',
    })

    assert.equal(plan.mode, 'NO_OP')
    assert.equal(plan.auditLogId, null)
    assert.deepEqual(plan.managerUserIdsToRemove, [])
    assert.deepEqual(plan.activeAssignmentIdsToClose, [])
    assert.equal(plan.requiresAgentAssignmentCreate, false)
    assert.equal(plan.requiresManagerLinkCreate, false)
})

test('stale token rejects a different desired state without a mutation plan', () => {
    const plan = buildConcurrentOwnershipPlan({
        userId: 'user-1',
        targetOwnerType: 'AGENT',
        targetOwnerId: 'agent-1',
        managerUserIds: [],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: 'current-group',
                whatsappGroupUrl: null,
            },
        ],
        sourceGroup: 'different-group',
        expectedOwnershipToken: 'ow1.stale-different-request',
        currentOwnershipToken: 'ow1.current',
    })

    assert.deepEqual(plan, {
        ok: false,
        code: 'OWNERSHIP_CHANGED',
        status: 409,
    })
})

test('summarizes current owners without assignment metadata', () => {
    const summary = buildSafeCurrentOwnershipSummary({
        managerLinks: [
            { id: 'manager-link-2', managerId: 'manager-2' },
            { id: 'manager-link-1', managerId: 'manager-1' },
            { id: 'manager-link-3', managerId: 'manager-1' },
        ],
        activeAssignments: [
            {
                id: 'assignment-2',
                agentId: 'agent-2',
                sourceGroup: 'private-group',
                whatsappGroupUrl: 'https://chat.whatsapp.com/private',
                updatedAt: new Date('2026-08-06T12:00:00.000Z'),
            },
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: null,
                whatsappGroupUrl: null,
                updatedAt: new Date('2026-08-06T11:00:00.000Z'),
            },
        ],
    })

    assert.deepEqual(summary, {
        managerOwnerIds: ['manager-1', 'manager-2'],
        agentOwnerIds: ['agent-1', 'agent-2'],
        managerLinkCount: 3,
        activeAssignmentCount: 2,
    })
    assert.equal(JSON.stringify(summary).includes('private'), false)
})

test('maps a Prisma uniqueness race to a safe ownership conflict response', () => {
    const evidence = {
        managerLinks: [{ id: 'manager-link-1', managerId: 'manager-1' }],
        activeAssignments: [{
            id: 'assignment-1',
            agentId: 'agent-1',
            sourceGroup: 'private-group',
            whatsappGroupUrl: 'https://chat.whatsapp.com/private',
            updatedAt: new Date('2026-08-06T12:00:00.000Z'),
        }],
    }
    const conflict = mapOwnershipMutationError(
        { code: 'P2002' },
        'ow1.current',
        evidence,
    )

    assert.deepEqual(conflict, {
        ok: false,
        code: 'OWNERSHIP_CONFLICT',
        status: 409,
        currentOwnershipToken: 'ow1.current',
        currentOwnershipSummary: {
            managerOwnerIds: ['manager-1'],
            agentOwnerIds: ['agent-1'],
            managerLinkCount: 1,
            activeAssignmentCount: 1,
        },
    })
    assert.deepEqual(buildOwnershipTransferErrorPayload(conflict!), {
        error: 'OWNERSHIP_CONFLICT',
        currentOwnershipToken: 'ow1.current',
        currentOwnershipSummary: {
            managerOwnerIds: ['manager-1'],
            agentOwnerIds: ['agent-1'],
            managerLinkCount: 1,
            activeAssignmentCount: 1,
        },
    })
    assert.equal(mapOwnershipMutationError(new Error('boom'), 'ow1.current', evidence), null)
})

test('rejects an overlong agent default before it can be copied', () => {
    const plan = buildConcurrentOwnershipPlan({
        userId: 'user-1',
        targetOwnerType: 'AGENT',
        targetOwnerId: 'agent-1',
        managerUserIds: [],
        activeAssignments: [],
        agentDefaultSourceGroup: 'g'.repeat(121),
        expectedOwnershipToken: 'ow1.current',
        currentOwnershipToken: 'ow1.current',
    })

    assert.deepEqual(plan, {
        ok: false,
        code: 'SOURCE_GROUP_TOO_LONG',
        status: 400,
    })
})

test('rejects an invalid explicit WhatsApp URL in the canonical ownership plan', () => {
    const plan = buildConcurrentOwnershipPlan({
        userId: 'user-1',
        targetOwnerType: 'AGENT',
        targetOwnerId: 'agent-1',
        managerUserIds: [],
        activeAssignments: [],
        whatsappGroupUrl: 'https://example.com/not-whatsapp',
        expectedOwnershipToken: 'ow1.current',
        currentOwnershipToken: 'ow1.current',
    })

    assert.deepEqual(plan, {
        ok: false,
        code: 'INVALID_WHATSAPP_GROUP_URL',
        status: 400,
    })
})

test('same-agent metadata change with a current token updates the assignment in place', () => {
    const plan = buildConcurrentOwnershipPlan({
        userId: 'user-1',
        targetOwnerType: 'AGENT',
        targetOwnerId: 'agent-1',
        managerUserIds: [],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: 'old-group',
                whatsappGroupUrl: 'https://chat.whatsapp.com/current',
            },
        ],
        sourceGroup: ' new-group ',
        expectedOwnershipToken: 'ow1.current',
        currentOwnershipToken: 'ow1.current',
    })

    assert.equal(plan.mode, 'UPDATED')
    assert.equal(plan.activeAssignmentIdToUpdate, 'assignment-1')
    assert.equal(plan.sourceGroup, 'new-group')
    assert.equal(plan.sourceGroupResolution, 'EXPLICIT')
    assert.equal(plan.whatsappGroupUrl, 'https://chat.whatsapp.com/current')
    assert.deepEqual(plan.activeAssignmentIdsToClose, [])
    assert.equal(plan.requiresAgentAssignmentCreate, false)
    assert.equal(plan.replacedOwnership, false)
})

test('exact manager ownership is a NO_OP before stale-token rejection', () => {
    const plan = buildConcurrentOwnershipPlan({
        userId: 'user-1',
        targetOwnerType: 'MANAGER',
        targetOwnerId: 'manager-1',
        managerUserIds: ['manager-link-1'],
        managerLinks: [{ id: 'manager-link-1', managerId: 'manager-1' }],
        activeAssignments: [],
        expectedOwnershipToken: 'ow1.stale-identical-manager-request',
        currentOwnershipToken: 'ow1.current-manager',
    })

    assert.equal(plan.mode, 'NO_OP')
    assert.equal(plan.auditLogId, null)
    assert.equal(plan.requiresManagerLinkCreate, false)
})

test('stale token cannot redirect one manager owner to another manager', () => {
    const plan = buildConcurrentOwnershipPlan({
        userId: 'user-1',
        targetOwnerType: 'MANAGER',
        targetOwnerId: 'manager-2',
        managerUserIds: ['manager-link-1'],
        managerLinks: [{ id: 'manager-link-1', managerId: 'manager-1' }],
        activeAssignments: [],
        expectedOwnershipToken: 'ow1.stale-manager-request',
        currentOwnershipToken: 'ow1.current-manager',
    })

    assert.deepEqual(plan, {
        ok: false,
        code: 'OWNERSHIP_CHANGED',
        status: 409,
    })
})

test('rejects inactive agent profile as transfer target', () => {
    assert.deepEqual(validateOwnershipTransferTargets({
        user: activeUser,
        targetOwner: { ...agent, agentProfile: { defaultSourceGroup: 'agent-default', isActive: false } },
        targetOwnerType: 'AGENT',
    }), { ok: false, code: 'INVALID_TARGET_OWNER', status: 400 })
})
