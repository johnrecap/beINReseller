import test from 'node:test'
import assert from 'node:assert/strict'
import {
    findDuplicateIds,
    normalizePointSettingsInput,
} from '@/lib/points/admin-settings-normalization'
import { POINTS_SETTINGS_COPY } from '@/lib/points/settings-copy'

test('current point setting field names win over legacy aliases', () => {
    const normalized = normalizePointSettingsInput({
        pointsEnabled: true,
        pointsStartAt: '2026-05-27T22:01:00.000Z',
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        userPointsPerThousand: 1,
        agentPointsPerThousand: 2,
        managerPointsPerThousand: 3,
        userGlobalPointsPerThousand: 10,
        agentDefaultPointsPerThousand: 20,
        managerDefaultPointsPerThousand: 30,
        managerOwnedUserPointsEnabled: true,
        managerOwnedUserPointsPerThousand: 4,
        agentOverrides: [],
        managerOverrides: [],
    })

    assert.equal(normalized.ok, true)
    assert.equal(normalized.data.userGlobalPointsPerThousand, 10)
    assert.equal(normalized.data.agentDefaultPointsPerThousand, 20)
    assert.equal(normalized.data.managerDefaultPointsPerThousand, 30)
    assert.equal(normalized.data.managerOwnedUserPointsEnabled, true)
    assert.equal(normalized.data.managerOwnedUserPointsPerThousand, 4)
})

test('legacy point setting aliases remain fallback values', () => {
    const normalized = normalizePointSettingsInput({
        pointsEnabled: false,
        pointsStartAt: null,
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        userPointsPerThousand: 1,
        agentPointsPerThousand: 2,
        managerPointsPerThousand: 3,
        agentOverrides: [],
        managerOverrides: [],
    })

    assert.equal(normalized.ok, true)
    assert.equal(normalized.data.userGlobalPointsPerThousand, 1)
    assert.equal(normalized.data.agentDefaultPointsPerThousand, 2)
    assert.equal(normalized.data.managerDefaultPointsPerThousand, 3)
    assert.equal(normalized.data.managerOwnedUserPointsEnabled, false)
    assert.equal(normalized.data.managerOwnedUserPointsPerThousand, 0)
})

test('zero override values are preserved as explicit rates', () => {
    const normalized = normalizePointSettingsInput({
        pointsEnabled: false,
        pointsStartAt: null,
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        userGlobalPointsPerThousand: 0,
        agentDefaultPointsPerThousand: 0,
        managerDefaultPointsPerThousand: 0,
        managerOwnedUserPointsEnabled: false,
        managerOwnedUserPointsPerThousand: 0,
        agentOverrides: [{ agentId: 'agent-1', pointsPerThousand: 0 }],
        managerOverrides: [{ managerId: 'manager-1', pointsPerThousand: 0 }],
    })

    assert.equal(normalized.ok, true)
    assert.deepEqual(normalized.data.agentOverrides, [
        { agentId: 'agent-1', pointsPerThousand: 0 },
    ])
    assert.deepEqual(normalized.data.managerOverrides, [
        { managerId: 'manager-1', pointsPerThousand: 0 },
    ])
})

test('duplicate override owners are reported before persistence', () => {
    assert.deepEqual(findDuplicateIds(['agent-1', 'agent-2', 'agent-1', 'agent-2']), [
        'agent-1',
        'agent-2',
    ])
})

test('settings copy explains direct admin-owned and manager-owned point rules', () => {
    assert.match(POINTS_SETTINGS_COPY.normalUserRate, /direct admin-owned users/)
    assert.match(POINTS_SETTINGS_COPY.managerOwnedUserToggle, /users under managers/)
    assert.match(POINTS_SETTINGS_COPY.managerOwnedUserRate, /manager-owned user points are enabled/)
})
