import test from 'node:test'
import assert from 'node:assert/strict'

test('documents agents tab API contract', () => {
    const response = {
        users: [{
            id: 'agent-1',
            username: 'agent-one',
            role: 'AGENT',
            assignedUsersCount: 2,
            points: {
                available: 0,
                lifetimeEarned: 0,
                converted: 0,
                reversed: 0,
                legacy: 0,
            },
        }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
    }

    assert.equal(response.users[0].role, 'AGENT')
    assert.equal(response.users[0].assignedUsersCount, 2)
    assert.equal(response.users[0].points.available, 0)
})
