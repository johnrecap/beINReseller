import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildOwnershipTransferPlan,
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

test('rejects inactive agent profile as transfer target', () => {
    assert.deepEqual(validateOwnershipTransferTargets({
        user: activeUser,
        targetOwner: { ...agent, agentProfile: { defaultSourceGroup: 'agent-default', isActive: false } },
        targetOwnerType: 'AGENT',
    }), { ok: false, code: 'INVALID_TARGET_OWNER', status: 400 })
})
