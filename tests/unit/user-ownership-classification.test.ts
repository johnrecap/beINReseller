import test from 'node:test'
import assert from 'node:assert/strict'
import {
    classifyCurrentUserOwner,
    summarizeOwnershipConflicts,
} from '@/lib/users/ownership'

const user = {
    id: 'user-1',
    role: 'USER',
    isActive: true,
    deletedAt: null,
    createdBy: null,
}

const adminOwner = {
    id: 'admin-1',
    username: 'admin',
    role: 'ADMIN',
    isActive: true,
    deletedAt: null,
}

const managerOwner = {
    id: 'manager-1',
    username: 'manager',
    role: 'MANAGER',
    isActive: true,
    deletedAt: null,
}

const agentOwner = {
    id: 'agent-1',
    username: 'agent',
    role: 'AGENT',
    isActive: true,
    deletedAt: null,
    agentProfile: {
        displayName: 'Agent Display',
        isActive: true,
    },
}

test('classifies direct admin-owned user from manager link owner role', () => {
    const owner = classifyCurrentUserOwner({
        user,
        managerLinks: [{ id: 'link-1', manager: adminOwner }],
        activeAssignments: [],
    })

    assert.equal(owner.ownerType, 'ADMIN')
    assert.equal(owner.ownerId, 'admin-1')
    assert.equal(owner.ownerLabel, 'admin')
    assert.equal(owner.isLegacyFallback, false)
})

test('classifies manager-owned user separately from admin-owned user', () => {
    const owner = classifyCurrentUserOwner({
        user,
        managerLinks: [{ id: 'link-1', manager: managerOwner }],
        activeAssignments: [],
    })

    assert.equal(owner.ownerType, 'MANAGER')
    assert.equal(owner.ownerId, 'manager-1')
})

test('classifies agent-owned user and keeps assignment evidence', () => {
    const owner = classifyCurrentUserOwner({
        user,
        managerLinks: [],
        activeAssignments: [{
            id: 'assignment-1',
            agentId: 'agent-1',
            sourceGroup: 'group-a',
            whatsappGroupUrl: 'https://chat.whatsapp.com/a',
            agent: agentOwner,
        }],
    })

    assert.equal(owner.ownerType, 'AGENT')
    assert.equal(owner.ownerId, 'agent-1')
    assert.equal(owner.ownerLabel, 'Agent Display')
    assert.equal(owner.agentAssignmentId, 'assignment-1')
})

test('current ownership beats legacy admin creator fallback', () => {
    const owner = classifyCurrentUserOwner({
        user: { ...user, createdBy: adminOwner },
        managerLinks: [{ id: 'link-1', manager: managerOwner }],
        activeAssignments: [],
    })

    assert.equal(owner.ownerType, 'MANAGER')
    assert.equal(owner.isLegacyFallback, false)
})

test('uses legacy admin creator only when no current owner exists', () => {
    const owner = classifyCurrentUserOwner({
        user: { ...user, createdBy: adminOwner },
        managerLinks: [],
        activeAssignments: [],
    })

    assert.equal(owner.ownerType, 'LEGACY_ADMIN')
    assert.equal(owner.ownerId, 'admin-1')
    assert.equal(owner.isLegacyFallback, true)
})

test('reports unowned when no active current or legacy owner exists', () => {
    const owner = classifyCurrentUserOwner({
        user,
        managerLinks: [],
        activeAssignments: [],
    })

    assert.equal(owner.ownerType, 'UNOWNED')
    assert.equal(owner.ownerId, null)
})

test('summarizes duplicate current owner evidence for audit', () => {
    const conflicts = summarizeOwnershipConflicts({
        managerLinks: [
            { id: 'link-1', manager: adminOwner },
            { id: 'link-2', manager: managerOwner },
        ],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: 'group-a',
                whatsappGroupUrl: null,
                agent: agentOwner,
            },
            {
                id: 'assignment-2',
                agentId: 'agent-2',
                sourceGroup: 'group-b',
                whatsappGroupUrl: null,
                agent: { ...agentOwner, id: 'agent-2', username: 'agent-2' },
            },
        ],
    })

    assert.deepEqual(conflicts.managerUserIds, ['link-1', 'link-2'])
    assert.deepEqual(conflicts.agentAssignmentIds, ['assignment-1', 'assignment-2'])
    assert.equal(conflicts.hasMixedCurrentOwners, true)
})
