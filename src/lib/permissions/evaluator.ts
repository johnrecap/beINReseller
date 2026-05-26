import type { Role } from '@/lib/permissions'
import {
    defaultRoleHasCatalogPermission,
    type AppPermissionKey,
    PANEL_USER_CREATION_FREEZE_KEY,
    PERMISSION_KEYS,
    type PermissionEffect,
} from './catalog'

export type PermissionSource = 'account_status' | 'global_block' | 'user_override' | 'role_setting' | 'default'

export interface PermissionUser {
    id: string
    role: Role | string
    isActive?: boolean
    deletedAt?: Date | string | null
}

export interface PermissionRoleSetting {
    role: Role | string
    permissionKey: AppPermissionKey | string
    effect: PermissionEffect | string
}

export interface PermissionUserOverride {
    userId: string
    permissionKey: AppPermissionKey | string
    effect: PermissionEffect | string
}

export interface PermissionGlobalSetting {
    key: string
    enabled: boolean
    reason?: string | null
}

export type PermissionEvaluationResult = {
    allowed: boolean
    source: PermissionSource
    code?: 'ACCOUNT_INACTIVE' | 'ACCOUNT_DELETED' | 'PANEL_USER_CREATION_DISABLED'
    globalBlock?: typeof PANEL_USER_CREATION_FREEZE_KEY
}

export type PanelUserCreationBlock =
    | {
        blocked: true
        code: 'PANEL_USER_CREATION_DISABLED'
        message: string
        reason?: string | null
    }
    | { blocked: false }

const USER_CREATION_PERMISSIONS = new Set<string>([
    PERMISSION_KEYS.USERS_CREATE,
    PERMISSION_KEYS.MANAGER_USERS_CREATE,
])

function isAllow(effect: string): boolean {
    return effect === 'allow'
}

function normalizeRole(role: string): Role | null {
    const upper = role.toUpperCase()
    if (upper === 'ADMIN' || upper === 'MANAGER' || upper === 'AGENT' || upper === 'USER') {
        return upper
    }
    return null
}

export function getPanelUserCreationBlock(globalSettings: PermissionGlobalSetting[] = []): PanelUserCreationBlock {
    const setting = globalSettings.find((item) => item.key === PANEL_USER_CREATION_FREEZE_KEY)

    if (!setting?.enabled) {
        return { blocked: false }
    }

    return {
        blocked: true,
        code: 'PANEL_USER_CREATION_DISABLED',
        message: 'User creation is currently disabled by the administrator.',
        reason: setting.reason ?? null,
    }
}

export function evaluatePermission(input: {
    user: PermissionUser | null | undefined
    permissionKey: AppPermissionKey
    roleSettings?: PermissionRoleSetting[]
    userOverrides?: PermissionUserOverride[]
    globalSettings?: PermissionGlobalSetting[]
}): PermissionEvaluationResult {
    const { user, permissionKey } = input

    if (!user?.isActive) {
        return { allowed: false, source: 'account_status', code: 'ACCOUNT_INACTIVE' }
    }

    if (user.deletedAt) {
        return { allowed: false, source: 'account_status', code: 'ACCOUNT_DELETED' }
    }

    if (USER_CREATION_PERMISSIONS.has(permissionKey)) {
        const creationBlock = getPanelUserCreationBlock(input.globalSettings)
        if (creationBlock.blocked) {
            return {
                allowed: false,
                source: 'global_block',
                code: creationBlock.code,
                globalBlock: PANEL_USER_CREATION_FREEZE_KEY,
            }
        }
    }

    const userOverride = input.userOverrides?.find((override) => (
        override.userId === user.id
        && override.permissionKey === permissionKey
    ))

    if (userOverride) {
        return {
            allowed: isAllow(userOverride.effect),
            source: 'user_override',
        }
    }

    const role = normalizeRole(user.role)
    const roleSetting = input.roleSettings?.find((setting) => (
        setting.role === role
        && setting.permissionKey === permissionKey
    ))

    if (roleSetting) {
        return {
            allowed: isAllow(roleSetting.effect),
            source: 'role_setting',
        }
    }

    return {
        allowed: role ? defaultRoleHasCatalogPermission(role, permissionKey) : false,
        source: 'default',
    }
}
