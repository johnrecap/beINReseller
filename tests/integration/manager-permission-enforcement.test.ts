import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluatePermission } from '@/lib/permissions/evaluator'
import { PANEL_USER_CREATION_FREEZE_KEY, PERMISSION_KEYS } from '@/lib/permissions/catalog'

test('global user creation freeze blocks manager-created users before balance transfer', () => {
    const result = evaluatePermission({
        user: {
            id: 'manager-1',
            role: 'MANAGER',
            isActive: true,
            deletedAt: null,
        },
        permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
        globalSettings: [{ key: PANEL_USER_CREATION_FREEZE_KEY, enabled: true }],
    })

    assert.deepEqual(result, {
        allowed: false,
        source: 'global_block',
        code: 'PANEL_USER_CREATION_DISABLED',
        globalBlock: PANEL_USER_CREATION_FREEZE_KEY,
    })
})

test('manager create-user permission denies manager-created users when freeze is off', () => {
    const result = evaluatePermission({
        user: {
            id: 'manager-1',
            role: 'MANAGER',
            isActive: true,
            deletedAt: null,
        },
        permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
        roleSettings: [
            {
                role: 'MANAGER',
                permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
                effect: 'deny',
            },
        ],
    })

    assert.deepEqual(result, {
        allowed: false,
        source: 'role_setting',
    })
})

test('manager balance add and withdraw use separate permissions', () => {
    const depositAllowed = evaluatePermission({
        user: {
            id: 'manager-1',
            role: 'MANAGER',
            isActive: true,
            deletedAt: null,
        },
        permissionKey: PERMISSION_KEYS.BALANCE_ADD,
        roleSettings: [
            {
                role: 'MANAGER',
                permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
                effect: 'deny',
            },
        ],
    })
    const withdrawalDenied = evaluatePermission({
        user: {
            id: 'manager-1',
            role: 'MANAGER',
            isActive: true,
            deletedAt: null,
        },
        permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
        roleSettings: [
            {
                role: 'MANAGER',
                permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
                effect: 'deny',
            },
        ],
    })

    assert.equal(depositAllowed.allowed, true)
    assert.deepEqual(withdrawalDenied, {
        allowed: false,
        source: 'role_setting',
    })
})
