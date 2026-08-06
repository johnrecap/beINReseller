import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildOwnershipToken,
    canonicalizeOwnershipEvidence,
    sortOwnershipOwnerIds,
} from '../../shared/db/ownership-evidence-lock'

test('ownership evidence is canonical regardless of database row order', () => {
    const first = {
        managerLinks: [
            { id: 'manager-link-b', managerId: 'manager-b' },
            { id: 'manager-link-a', managerId: 'manager-a' },
        ],
        activeAssignments: [
            {
                id: 'assignment-b',
                agentId: 'agent-b',
                updatedAt: new Date('2026-08-06T10:00:00.000Z'),
                sourceGroup: null,
                whatsappGroupUrl: 'https://chat.whatsapp.com/private-b',
            },
            {
                id: 'assignment-a',
                agentId: 'agent-a',
                updatedAt: new Date('2026-08-06T09:00:00.000Z'),
                sourceGroup: 'group-a',
                whatsappGroupUrl: null,
            },
        ],
    }
    const second = {
        managerLinks: [...first.managerLinks].reverse(),
        activeAssignments: [...first.activeAssignments].reverse(),
    }

    assert.deepEqual(canonicalizeOwnershipEvidence(second), canonicalizeOwnershipEvidence(first))
    assert.equal(buildOwnershipToken(second), buildOwnershipToken(first))
})

test('ownership token changes for assignment metadata without exposing a WhatsApp invite', () => {
    const base = {
        managerLinks: [],
        activeAssignments: [{
            id: 'assignment-a',
            agentId: 'agent-a',
            updatedAt: '2026-08-06T09:00:00.000Z',
            sourceGroup: null,
            whatsappGroupUrl: 'https://chat.whatsapp.com/private-a',
        }],
    }
    const changed = {
        ...base,
        activeAssignments: [{
            ...base.activeAssignments[0],
            whatsappGroupUrl: 'https://chat.whatsapp.com/private-b',
        }],
    }

    const canonical = JSON.stringify(canonicalizeOwnershipEvidence(base))
    const token = buildOwnershipToken(base)

    assert.notEqual(buildOwnershipToken(changed), token)
    assert.match(token, /^ow1\.[A-Za-z0-9_-]+$/)
    assert.equal(canonical.includes('private-a'), false)
    assert.equal(token.includes('private-a'), false)
})

test('owner row locks use unique lexical ids and never include the subject twice', () => {
    assert.deepEqual(sortOwnershipOwnerIds({
        subjectUserId: 'user-z',
        ownerUserIds: ['manager-b', 'user-z', 'agent-a', 'manager-b'],
    }), ['agent-a', 'manager-b'])
})
