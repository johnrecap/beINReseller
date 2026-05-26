import test from 'node:test'
import assert from 'node:assert/strict'
import {
    evaluatePermission,
    getPanelUserCreationBlock,
} from '@/lib/permissions/evaluator'
import {
    PANEL_USER_CREATION_FREEZE_KEY,
    PERMISSION_KEYS,
} from '@/lib/permissions/catalog'

const activeManager = {
    id: 'manager-1',
    role: 'MANAGER',
    isActive: true,
    deletedAt: null,
}

test('blocks inactive or deleted users before permission settings are evaluated', () => {
    assert.deepEqual(evaluatePermission({
        user: { ...activeManager, isActive: false },
        permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
    }), {
        allowed: false,
        source: 'account_status',
        code: 'ACCOUNT_INACTIVE',
    })

    assert.deepEqual(evaluatePermission({
        user: { ...activeManager, deletedAt: new Date('2026-01-01T00:00:00.000Z') },
        permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
    }), {
        allowed: false,
        source: 'account_status',
        code: 'ACCOUNT_DELETED',
    })
})

test('global user creation freeze overrides role and user allows', () => {
    assert.deepEqual(evaluatePermission({
        user: activeManager,
        permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
        globalSettings: [{
            key: PANEL_USER_CREATION_FREEZE_KEY,
            enabled: true,
        }],
        userOverrides: [{
            userId: activeManager.id,
            permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
            effect: 'allow',
        }],
    }), {
        allowed: false,
        source: 'global_block',
        code: 'PANEL_USER_CREATION_DISABLED',
        globalBlock: PANEL_USER_CREATION_FREEZE_KEY,
    })
})

test('user override wins over role setting', () => {
    assert.deepEqual(evaluatePermission({
        user: activeManager,
        permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
        roleSettings: [{
            role: 'MANAGER',
            permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
            effect: 'allow',
        }],
        userOverrides: [{
            userId: activeManager.id,
            permissionKey: PERMISSION_KEYS.BALANCE_WITHDRAW,
            effect: 'deny',
        }],
    }), {
        allowed: false,
        source: 'user_override',
    })
})

test('role setting wins over static default', () => {
    assert.deepEqual(evaluatePermission({
        user: activeManager,
        permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
        roleSettings: [{
            role: 'MANAGER',
            permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
            effect: 'deny',
        }],
    }), {
        allowed: false,
        source: 'role_setting',
    })
})

test('falls back to catalog defaults when no dynamic setting exists', () => {
    assert.deepEqual(evaluatePermission({
        user: activeManager,
        permissionKey: PERMISSION_KEYS.MANAGER_USERS_CREATE,
    }), {
        allowed: true,
        source: 'default',
    })

    assert.deepEqual(evaluatePermission({
        user: activeManager,
        permissionKey: PERMISSION_KEYS.PERMISSIONS_MANAGE,
    }), {
        allowed: false,
        source: 'default',
    })
})

test('detects panel user creation freeze setting', () => {
    assert.deepEqual(getPanelUserCreationBlock([
        { key: PANEL_USER_CREATION_FREEZE_KEY, enabled: true, reason: 'audit' },
    ]), {
        blocked: true,
        code: 'PANEL_USER_CREATION_DISABLED',
        message: 'User creation is currently disabled by the administrator.',
        reason: 'audit',
    })

    assert.deepEqual(getPanelUserCreationBlock([]), {
        blocked: false,
    })
})
