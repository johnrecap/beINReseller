import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildPointSettingsResponse,
    normalizePointSettingsInput,
} from '@/lib/points/admin-settings-normalization'

test('admin points save readback uses canonical saved values', () => {
    const normalized = normalizePointSettingsInput({
        pointsEnabled: true,
        pointsStartAt: '2026-05-27T22:01:00.000Z',
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        userPointsPerThousand: 1,
        agentPointsPerThousand: 2,
        managerPointsPerThousand: 3,
        userGlobalPointsPerThousand: 11,
        managerOwnedUserPointsEnabled: true,
        managerOwnedUserPointsPerThousand: 12,
        agentDefaultPointsPerThousand: 13,
        managerDefaultPointsPerThousand: 14,
        agentOverrides: [{ agentId: 'agent-1', pointsPerThousand: 0 }],
        managerOverrides: [{ managerId: 'manager-1', pointsPerThousand: 6 }],
    })

    assert.equal(normalized.ok, true)

    const response = buildPointSettingsResponse({
        settings: {
            pointsEnabled: normalized.data.pointsEnabled,
            pointsStartAt: normalized.data.pointsStartAt ? new Date(normalized.data.pointsStartAt) : null,
            cashConversionPoints: normalized.data.cashConversionPoints,
            cashConversionAmountUsd: normalized.data.cashConversionAmountUsd,
            managerOwnedUserPointsEnabled: normalized.data.managerOwnedUserPointsEnabled,
        },
        rates: {
            userGlobalPointsPerThousand: normalized.data.userGlobalPointsPerThousand,
            managerOwnedUserPointsPerThousand: normalized.data.managerOwnedUserPointsPerThousand,
            agentDefaultPointsPerThousand: normalized.data.agentDefaultPointsPerThousand,
            managerDefaultPointsPerThousand: normalized.data.managerDefaultPointsPerThousand,
        },
        agents: [{
            id: 'agent-1',
            username: 'agent',
            name: 'Agent',
            isActive: true,
            overridePointsPerThousand: 0,
        }],
        managers: [{
            id: 'manager-1',
            username: 'manager',
            isActive: true,
            overridePointsPerThousand: 6,
        }],
    })

    assert.deepEqual(response.defaults, {
        userGlobalPointsPerThousand: 11,
        managerOwnedUserPointsPerThousand: 12,
        agentDefaultPointsPerThousand: 13,
        managerDefaultPointsPerThousand: 14,
    })
    assert.equal(response.settings.managerOwnedUserPointsEnabled, true)
    assert.equal(response.agents[0].overridePointsPerThousand, 0)
    assert.equal(response.managers[0].overridePointsPerThousand, 6)
})

test('duplicate override owners are rejected by normalized save data', () => {
    const normalized = normalizePointSettingsInput({
        pointsEnabled: false,
        pointsStartAt: null,
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        userGlobalPointsPerThousand: 1,
        managerOwnedUserPointsPerThousand: 2,
        agentDefaultPointsPerThousand: 3,
        managerDefaultPointsPerThousand: 4,
        agentOverrides: [
            { agentId: 'agent-1', pointsPerThousand: 1 },
            { agentId: 'agent-1', pointsPerThousand: 2 },
        ],
        managerOverrides: [
            { managerId: 'manager-1', pointsPerThousand: 1 },
            { managerId: 'manager-1', pointsPerThousand: 2 },
        ],
    })

    assert.equal(normalized.ok, false)
    assert.deepEqual(normalized.duplicateAgentIds, ['agent-1'])
    assert.deepEqual(normalized.duplicateManagerIds, ['manager-1'])
})
