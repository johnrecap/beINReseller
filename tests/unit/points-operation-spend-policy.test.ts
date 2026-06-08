import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildOperationSpendAwardEntries,
    getOperationSpendEligibility,
    resolveOperationPointRecipients,
    resolveOperationSpendAwardPolicy,
} from '../../shared/points/operation-spend-policy'

const activeUser = { id: 'user-1', role: 'USER', isActive: true, deletedAt: null }
const activeAdmin = { id: 'admin-1', role: 'ADMIN', isActive: true, deletedAt: null }
const activeAgent = { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null }
const activeManager = { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null }

test('policy disables all spend points when program is off', () => {
    const policy = resolveOperationSpendAwardPolicy({
        status: 'COMPLETED',
        type: 'RENEW',
        amount: 1000,
        completedAt: new Date('2026-06-08T10:00:00.000Z'),
        settings: {
            pointsEnabled: false,
            pointsStartAt: null,
            managerOwnedUserPointsEnabled: true,
        },
        operationUser: activeUser,
        managerOwnership: { manager: activeAdmin },
        agentAssignment: { agent: activeAgent },
    })

    assert.deepEqual(policy, {
        eligible: false,
        skippedReason: 'POINTS_DISABLED',
        recipients: [],
    })
})

test('policy awards admin-owned direct users to the user only', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: activeUser,
        managerOwnership: { manager: activeAdmin },
        agentAssignment: null,
        managerOwnedUserPointsEnabled: true,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
    ])
})

test('policy awards legacy admin-created users to the user only', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: { ...activeUser, createdBy: activeAdmin },
        managerOwnership: null,
        agentAssignment: null,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
    ])
})

test('policy does not award unowned active users by default', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: activeUser,
        managerOwnership: null,
        agentAssignment: null,
    })

    assert.deepEqual(recipients, [])
})

test('policy preserves manager precedence when dirty data also has an agent', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: activeUser,
        managerOwnership: { manager: activeManager },
        agentAssignment: { agent: activeAgent },
        managerOwnedUserPointsEnabled: true,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'manager-1', ownerRole: 'MANAGER', ownerKind: 'MANAGER' },
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'MANAGER_OWNED_USER' },
    ])
})

test('policy keeps agent-owned user and agent recipients', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: activeUser,
        managerOwnership: null,
        agentAssignment: { agent: activeAgent },
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
        { ownerUserId: 'agent-1', ownerRole: 'AGENT', ownerKind: 'AGENT' },
    ])
})

test('policy rejects incomplete and before-start operations', () => {
    assert.deepEqual(getOperationSpendEligibility({
        status: 'COMPLETING',
        type: 'RENEW',
        amount: 1000,
        completedAt: new Date('2026-06-08T10:00:00.000Z'),
        settings: {
            pointsEnabled: true,
            pointsStartAt: null,
        },
    }), { eligible: false, reason: 'NOT_COMPLETED' })

    assert.deepEqual(getOperationSpendEligibility({
        status: 'COMPLETED',
        type: 'RENEW',
        amount: 1000,
        completedAt: new Date('2026-06-08T08:59:59.000Z'),
        settings: {
            pointsEnabled: true,
            pointsStartAt: new Date('2026-06-08T09:00:00.000Z'),
        },
    }), { eligible: false, reason: 'BEFORE_POINTS_START' })
})

test('policy builds positive entries and skips explicit zero rates', () => {
    const entries = buildOperationSpendAwardEntries({
        operationId: 'operation-1',
        amountUsd: 1000,
        recipients: [
            { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER', ratePerThousand: 4 },
            { ownerUserId: 'agent-1', ownerRole: 'AGENT', ownerKind: 'AGENT', ratePerThousand: 0 },
        ],
    })

    assert.deepEqual(entries.map((entry) => ({
        ownerUserId: entry.ownerUserId,
        ownerRoleAtTime: entry.ownerRoleAtTime,
        sourceId: entry.sourceId,
        points: entry.points,
        ratePerThousandSnapshot: entry.ratePerThousandSnapshot,
    })), [
        {
            ownerUserId: 'user-1',
            ownerRoleAtTime: 'USER',
            sourceId: 'operation-1',
            points: 4,
            ratePerThousandSnapshot: 4,
        },
    ])
})
