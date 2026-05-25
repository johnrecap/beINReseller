import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAgentTransferPlan,
    resolveAgentSourceGroup,
    validateAgentTransferTargets,
} from '@/lib/agents/assignment-transfer'

const activeUser = {
    id: 'user-1',
    role: 'USER',
    isActive: true,
    deletedAt: null,
}

const activeAgent = {
    id: 'agent-1',
    role: 'AGENT',
    isActive: true,
    deletedAt: null,
    agentProfile: {
        defaultSourceGroup: 'default-group',
        isActive: true,
    },
}

test('validates transfer target user and agent', () => {
    assert.deepEqual(validateAgentTransferTargets({
        user: activeUser,
        agent: activeAgent,
    }), { ok: true })

    assert.deepEqual(validateAgentTransferTargets({
        user: { ...activeUser, role: 'MANAGER' },
        agent: activeAgent,
    }), { ok: false, code: 'INVALID_TARGET_USER', status: 400 })

    assert.deepEqual(validateAgentTransferTargets({
        user: activeUser,
        agent: { ...activeAgent, isActive: false },
    }), { ok: false, code: 'INVALID_TARGET_AGENT', status: 400 })

    assert.deepEqual(validateAgentTransferTargets({
        user: activeUser,
        agent: { ...activeAgent, agentProfile: { defaultSourceGroup: 'default-group', isActive: false } },
    }), { ok: false, code: 'INVALID_TARGET_AGENT', status: 400 })
})

test('resolves source group from explicit value or agent default', () => {
    assert.deepEqual(resolveAgentSourceGroup({
        requestedSourceGroup: ' requested ',
        agentDefaultSourceGroup: 'default',
    }), { ok: true, sourceGroup: 'requested' })

    assert.deepEqual(resolveAgentSourceGroup({
        requestedSourceGroup: '   ',
        agentDefaultSourceGroup: ' default ',
    }), { ok: true, sourceGroup: 'default' })

    assert.deepEqual(resolveAgentSourceGroup({
        requestedSourceGroup: '',
        agentDefaultSourceGroup: null,
    }), { ok: false, code: 'SOURCE_GROUP_REQUIRED', status: 400 })
})

test('builds direct user transfer plan', () => {
    const plan = buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: 'group-a',
        managerOwnerIds: [],
        activeAssignments: [],
        replaceExisting: true,
    })

    assert.deepEqual(plan, {
        mode: 'created',
        userId: 'user-1',
        agentId: 'agent-1',
        sourceGroup: 'group-a',
        previousManagerOwnerIds: [],
        previousAgentAssignmentIds: [],
        replacedOwnership: false,
    })
})

test('builds transfer plan for manager-owned user', () => {
    const plan = buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: 'group-a',
        managerOwnerIds: ['manager-1', 'admin-1'],
        activeAssignments: [],
        replaceExisting: true,
    })

    assert.equal('ok' in plan, false)
    if ('ok' in plan) return
    assert.deepEqual(plan.mode, 'transferred')
    assert.deepEqual(plan.previousManagerOwnerIds, ['manager-1', 'admin-1'])
    assert.equal(plan.replacedOwnership, true)
})

test('builds transfer plan for agent-owned user', () => {
    const plan = buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-2',
        sourceGroup: 'group-b',
        managerOwnerIds: [],
        activeAssignments: [
            { id: 'assignment-1', agentId: 'agent-1', sourceGroup: 'group-a' },
        ],
        replaceExisting: true,
    })

    assert.deepEqual(plan, {
        mode: 'transferred',
        userId: 'user-1',
        agentId: 'agent-2',
        sourceGroup: 'group-b',
        previousManagerOwnerIds: [],
        previousAgentAssignmentIds: ['assignment-1'],
        replacedOwnership: true,
    })
})

test('same-agent transfer refreshes source group without duplicate active assignment', () => {
    const plan = buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: 'new-group',
        managerOwnerIds: [],
        activeAssignments: [
            { id: 'assignment-1', agentId: 'agent-1', sourceGroup: 'old-group' },
        ],
        replaceExisting: true,
    })

    assert.equal('ok' in plan, false)
    if ('ok' in plan) return
    assert.equal(plan.mode, 'refreshed')
    assert.equal(plan.replacedOwnership, true)
    assert.deepEqual(plan.previousAgentAssignmentIds, ['assignment-1'])
})

test('rejects replacing existing ownership when replaceExisting is false', () => {
    assert.deepEqual(buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: 'group-a',
        managerOwnerIds: ['manager-1'],
        activeAssignments: [],
        replaceExisting: false,
    }), { ok: false, code: 'OWNERSHIP_EXISTS', status: 409 })
})
