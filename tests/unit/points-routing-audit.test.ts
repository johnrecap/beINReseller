import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyHistoricalPointRoutingCandidate } from '@/lib/points/historical-routing-audit'

test('classifies manager-owned user operation spend as a safe historical candidate', () => {
    const candidate = classifyHistoricalPointRoutingCandidate({
        ledgerEntryId: 'ledger-1',
        operationId: 'operation-1',
        wrongOwnerUserId: 'user-1',
        wrongOwnerUsername: 'customer1',
        ownerRoleAtTime: 'USER',
        sourceType: 'OPERATION_SPEND',
        status: 'AVAILABLE',
        points: 4.37,
        operationUser: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: {
            manager: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        },
        agentAssignment: null,
        pointCashRedemption: null,
    })

    assert.deepEqual(candidate, {
        ledgerEntryId: 'ledger-1',
        operationId: 'operation-1',
        wrongOwnerUserId: 'user-1',
        wrongOwnerUsername: 'customer1',
        points: 4.37,
        availableRisk: 4.37,
        convertedRisk: false,
        expectedOwnerUserId: 'manager-1',
        expectedOwnerRole: 'MANAGER',
        reason: 'MANAGER_LINK',
        reviewRequired: false,
    })
})

test('does not classify legitimate admin-created direct user points as historical candidates', () => {
    const candidate = classifyHistoricalPointRoutingCandidate({
        ledgerEntryId: 'ledger-2',
        operationId: 'operation-2',
        wrongOwnerUserId: 'user-2',
        ownerRoleAtTime: 'USER',
        sourceType: 'OPERATION_SPEND',
        status: 'REDEEMED',
        points: 3,
        operationUser: {
            id: 'user-2',
            role: 'USER',
            isActive: true,
            deletedAt: null,
            createdBy: { id: 'admin-1', role: 'ADMIN', isActive: true, deletedAt: null },
        },
        managerOwnership: null,
        agentAssignment: null,
        pointCashRedemption: { balanceAmountUsd: 1.5 },
    })

    assert.equal(candidate, null)
})

test('does not classify legitimate agent-owned user points as historical candidates', () => {
    const candidate = classifyHistoricalPointRoutingCandidate({
        ledgerEntryId: 'ledger-3',
        operationId: 'operation-3',
        wrongOwnerUserId: 'user-3',
        ownerRoleAtTime: 'USER',
        sourceType: 'OPERATION_SPEND',
        status: 'AVAILABLE',
        points: 1,
        operationUser: { id: 'user-3', role: 'USER', isActive: true, deletedAt: null },
        managerOwnership: null,
        agentAssignment: {
            agent: { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null },
        },
        pointCashRedemption: null,
    })

    assert.equal(candidate, null)
})
