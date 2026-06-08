import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildOperationSpendAwardEntries,
    getOperationSpendEligibility,
    resolveOperationPointRecipients,
} from '@/lib/points/operation-awards'
import { buildPointReversalEntries } from '@/lib/points/reversals'

test('routes manager-owned user spend to the manager only when manager-owned user points are disabled', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: {
            manager: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        },
        agentAssignment: {
            agent: { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null },
        },
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'manager-1', ownerRole: 'MANAGER', ownerKind: 'MANAGER' },
    ])
})

test('routes manager-owned user spend to manager and user when manager-owned user points are enabled', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: {
            manager: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        },
        agentAssignment: {
            agent: { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null },
        },
        managerOwnedUserPointsEnabled: true,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'manager-1', ownerRole: 'MANAGER', ownerKind: 'MANAGER' },
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'MANAGER_OWNED_USER' },
    ])
})

test('builds manager-owned user entries with a dedicated rate bucket', () => {
    const entries = buildOperationSpendAwardEntries({
        operationId: 'operation-manager-user',
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

test('routes agent-owned user spend to both user and agent', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: null,
        agentAssignment: {
            agent: { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null },
        },
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
        { ownerUserId: 'agent-1', ownerRole: 'AGENT', ownerKind: 'AGENT' },
    ])
})

test('routes transferred user future spend to user and agent when manager link is removed', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: null,
        agentAssignment: {
            agent: { id: 'agent-2', role: 'AGENT', isActive: true, deletedAt: null },
        },
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
        { ownerUserId: 'agent-2', ownerRole: 'AGENT', ownerKind: 'AGENT' },
    ])
})

test('routes direct admin-created user spend to the user only', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: {
            id: 'user-1',
            role: 'USER',
            isActive: true,
            deletedAt: null,
            createdBy: { id: 'admin-1', role: 'ADMIN', isActive: true, deletedAt: null },
        },
        managerOwnership: null,
        agentAssignment: null,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
    ])
})

test('routes direct admin-owned user spend to the user only', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: {
            manager: { id: 'admin-1', role: 'ADMIN', isActive: true, deletedAt: null },
        },
        agentAssignment: null,
        managerOwnedUserPointsEnabled: true,
    })

    assert.deepEqual(recipients, [
        { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER' },
    ])
})

test('does not fall back to user points without a valid owner path', () => {
    const recipients = resolveOperationPointRecipients({
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: null,
        agentAssignment: null,
    })

    assert.deepEqual(recipients, [])
})

test('does not route direct user spend to inactive or deleted admin creator', () => {
    const inactiveAdminRecipients = resolveOperationPointRecipients({
        operationUser: {
            id: 'user-1',
            role: 'USER',
            isActive: true,
            deletedAt: null,
            createdBy: { id: 'admin-1', role: 'ADMIN', isActive: false, deletedAt: null },
        },
        managerOwnership: null,
        agentAssignment: null,
    })

    const deletedAdminRecipients = resolveOperationPointRecipients({
        operationUser: {
            id: 'user-2',
            role: 'USER',
            isActive: true,
            deletedAt: null,
            createdBy: { id: 'admin-2', role: 'ADMIN', isActive: true, deletedAt: new Date('2026-05-01T00:00:00.000Z') },
        },
        managerOwnership: null,
        agentAssignment: null,
    })

    assert.deepEqual(inactiveAdminRecipients, [])
    assert.deepEqual(deletedAdminRecipients, [])
})

test('builds admin-owned direct user entries with the normal user rate bucket', () => {
    const entries = buildOperationSpendAwardEntries({
        operationId: 'operation-admin',
        amountUsd: 1000,
        recipients: [
            {
                ownerUserId: 'user-1',
                ownerRole: 'USER',
                ownerKind: 'USER',
                ratePerThousand: 4,
            },
        ],
    })

    assert.deepEqual(entries.map((entry) => ({
        ownerUserId: entry.ownerUserId,
        ownerRoleAtTime: entry.ownerRoleAtTime,
        points: entry.points,
    })), [
        {
            ownerUserId: 'user-1',
            ownerRoleAtTime: 'USER',
            points: 4,
        },
    ])
})

test('skips non-completed and before-start operations', () => {
    assert.deepEqual(getOperationSpendEligibility({
        status: 'PROCESSING',
        amount: 100,
        completedAt: new Date('2026-05-25T10:00:00.000Z'),
        settings: {
            pointsEnabled: true,
            pointsStartAt: new Date('2026-05-25T09:00:00.000Z'),
        },
    }), { eligible: false, reason: 'NOT_COMPLETED' })

    assert.deepEqual(getOperationSpendEligibility({
        status: 'COMPLETED',
        amount: 100,
        completedAt: new Date('2026-05-25T08:59:59.000Z'),
        settings: {
            pointsEnabled: true,
            pointsStartAt: new Date('2026-05-25T09:00:00.000Z'),
        },
    }), { eligible: false, reason: 'BEFORE_POINTS_START' })
})

test('builds one operation spend entry per owner with stable idempotency keys', () => {
    const entries = buildOperationSpendAwardEntries({
        operationId: 'operation-1',
        amountUsd: 200,
        recipients: [
            { ownerUserId: 'user-1', ownerRole: 'USER', ownerKind: 'USER', ratePerThousand: 5 },
            { ownerUserId: 'agent-1', ownerRole: 'AGENT', ownerKind: 'AGENT', ratePerThousand: 2 },
        ],
    })

    assert.deepEqual(entries.map((entry) => ({
        ownerUserId: entry.ownerUserId,
        ownerRoleAtTime: entry.ownerRoleAtTime,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        points: entry.points,
    })), [
        {
            ownerUserId: 'user-1',
            ownerRoleAtTime: 'USER',
            sourceType: 'OPERATION_SPEND',
            sourceId: 'operation-1',
            points: 1,
        },
        {
            ownerUserId: 'agent-1',
            ownerRoleAtTime: 'AGENT',
            sourceType: 'OPERATION_SPEND',
            sourceId: 'operation-1',
            points: 0.4,
        },
    ])
})

test('builds idempotent reversal entries from original operation spend entries', () => {
    const reversals = buildPointReversalEntries({
        operationId: 'operation-1',
        reason: 'refund',
        originalEntries: [
            { id: 'ledger-1', ownerUserId: 'user-1', ownerRoleAtTime: 'USER', points: 1 },
        ],
    })

    assert.deepEqual(reversals, [
        {
            ownerUserId: 'user-1',
            ownerRoleAtTime: 'USER',
            sourceType: 'POINT_REVERSAL',
            sourceId: 'operation-1:user-1:refund',
            points: -1,
            notes: 'Point reversal for operation operation-1 because refund',
        },
    ])
})
