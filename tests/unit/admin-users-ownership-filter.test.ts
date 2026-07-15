import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAgentOwnedUserFilter,
    buildManagerOwnedUserFilter,
    resolveAdminUsersOwnerFilter,
} from '@/lib/admin/users-ownership-filter'

test('manager user filter uses current ownership before legacy creator fallback', () => {
    assert.deepEqual(buildManagerOwnedUserFilter('admin-1'), {
        OR: [
            { managerLink: { some: { managerId: 'admin-1' } } },
            {
                createdById: 'admin-1',
                managerLink: { none: {} },
                agentAssignmentAsUser: { none: { isActive: true } },
            },
        ],
    })
})

test('agent user filter includes only active assignments for that agent', () => {
    assert.deepEqual(buildAgentOwnedUserFilter('agent-1'), {
        agentAssignmentAsUser: {
            some: {
                agentId: 'agent-1',
                isActive: true,
            },
        },
    })
})

test('owner filter rejects manager and agent parameters together', () => {
    assert.deepEqual(resolveAdminUsersOwnerFilter({
        managerId: 'manager-1',
        agentId: 'agent-1',
    }), {
        ok: false,
        error: 'INVALID_OWNER_FILTER',
    })
})
