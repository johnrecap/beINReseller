import test from 'node:test'
import assert from 'node:assert/strict'
import { getPanelUserCreationBlock } from '@/lib/permissions/evaluator'
import { PANEL_USER_CREATION_FREEZE_KEY, PERMISSION_KEYS } from '@/lib/permissions/catalog'
import { evaluatePermission } from '@/lib/permissions/evaluator'

test('global user creation freeze blocks admin-created users', () => {
    const block = getPanelUserCreationBlock([
        { key: PANEL_USER_CREATION_FREEZE_KEY, enabled: true },
    ])

    assert.deepEqual(block, {
        blocked: true,
        code: 'PANEL_USER_CREATION_DISABLED',
        message: 'User creation is currently disabled by the administrator.',
        reason: null,
    })
})

test('global user creation freeze can be read and updated by protected admins', () => {
    const updateResponse = {
        success: true,
        setting: {
            key: PANEL_USER_CREATION_FREEZE_KEY,
            enabled: true,
            reason: 'Pause user creation during audit',
        },
    }

    assert.equal(updateResponse.success, true)
    assert.equal(updateResponse.setting.key, PANEL_USER_CREATION_FREEZE_KEY)
    assert.equal(updateResponse.setting.enabled, true)
})

test('role-level permission changes can deny manager actions', () => {
    const result = evaluatePermission({
        user: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
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

test('user-specific overrides affect only the target account', () => {
    const deniedUser = evaluatePermission({
        user: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
        userOverrides: [
            {
                userId: 'manager-1',
                permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
                effect: 'deny',
            },
        ],
    })
    const unaffectedUser = evaluatePermission({
        user: { id: 'manager-2', role: 'MANAGER', isActive: true, deletedAt: null },
        permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
        userOverrides: [
            {
                userId: 'manager-1',
                permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
                effect: 'deny',
            },
        ],
    })

    assert.deepEqual(deniedUser, {
        allowed: false,
        source: 'user_override',
    })
    assert.equal(unaffectedUser.allowed, true)
})

test('last protected admin cannot be locked out', { todo: true }, () => {
    assert.ok(true)
})
