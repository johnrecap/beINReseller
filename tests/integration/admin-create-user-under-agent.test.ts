import test from 'node:test'
import assert from 'node:assert/strict'

test('documents create user under agent response contract', () => {
    const response = {
        success: true,
        user: {
            id: 'user-1',
            role: 'USER',
        },
        assignment: {
            id: 'assignment-1',
            agentId: 'agent-1',
            sourceGroup: 'group-a',
        },
    }

    assert.equal(response.success, true)
    assert.equal(response.user.role, 'USER')
    assert.equal(response.assignment.agentId, 'agent-1')
})
