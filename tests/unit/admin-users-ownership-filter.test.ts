import test from 'node:test'
import assert from 'node:assert/strict'
import { buildManagerOwnedUserFilter } from '@/lib/admin/users-ownership-filter'

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
