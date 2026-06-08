import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildWorkerPointEntries,
    resolveWorkerOperationPointRecipients,
} from '../../worker/src/lib/points'

test('worker keeps manager-only recipients when manager-owned user points are disabled', () => {
    const recipients = resolveWorkerOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        manager: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        agent: { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null },
        managerOwnedUserPointsEnabled: false,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'manager-1', ownerRole: 'MANAGER', ownerKind: 'MANAGER' },
    ])
})

test('worker adds user recipient when manager-owned user points are enabled', () => {
    const recipients = resolveWorkerOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        manager: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        agent: { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null },
        managerOwnedUserPointsEnabled: true,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'manager-1', ownerRole: 'MANAGER', ownerKind: 'MANAGER' },
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'MANAGER_OWNED_USER' },
    ])
})

test('worker builds manager and manager-owned user point entries with distinct rates', () => {
    const entries = buildWorkerPointEntries({
        operationId: 'operation-1',
        amountUsd: 500,
        recipients: [
            { ownerUserId: 'manager-1', ownerRole: 'MANAGER', ownerKind: 'MANAGER', ratePerThousand: 10 },
            { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'MANAGER_OWNED_USER', ratePerThousand: 4 },
        ],
    })

    assert.deepEqual(entries.map((entry) => ({
        ownerUserId: entry.ownerUserId,
        ownerRoleAtTime: entry.ownerRoleAtTime,
        points: entry.points,
        ratePerThousandSnapshot: entry.ratePerThousandSnapshot,
    })), [
        {
            ownerUserId: 'manager-1',
            ownerRoleAtTime: 'MANAGER',
            points: 5,
            ratePerThousandSnapshot: 10,
        },
        {
            ownerUserId: 'user-1',
            ownerRoleAtTime: 'USER',
            points: 2,
            ratePerThousandSnapshot: 4,
        },
    ])
})

test('worker routes admin-owned direct user spend to the user only', () => {
    const recipients = resolveWorkerOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        manager: { id: 'admin-1', role: 'ADMIN', isActive: true, deletedAt: null },
        agent: null,
        managerOwnedUserPointsEnabled: true,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
    ])
})

test('worker routes legacy admin-created user spend to the user only', () => {
    const recipients = resolveWorkerOperationPointRecipients({
        operationUser: {
            id: 'user-1',
            role: 'USER',
            isActive: true,
            deletedAt: null,
            createdBy: { id: 'admin-1', role: 'ADMIN', isActive: true, deletedAt: null },
        },
        manager: null,
        agent: null,
        managerOwnedUserPointsEnabled: false,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
    ])
})

test('worker does not award unowned active users by default', () => {
    const recipients = resolveWorkerOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        manager: null,
        agent: null,
        managerOwnedUserPointsEnabled: false,
    })

    assert.deepEqual(recipients, [])
})
