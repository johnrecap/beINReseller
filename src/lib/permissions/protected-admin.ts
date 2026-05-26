import type { PrismaClient } from '@prisma/client'
import type { Role } from '@/lib/permissions'
import { PERMISSION_KEYS, type AppPermissionKey, type PermissionEffect } from './catalog'
import { evaluatePermission, type PermissionRoleSetting, type PermissionUserOverride } from './evaluator'

type PermissionDbClient = Pick<
    PrismaClient,
    'protectedAdmin' | 'user' | 'rolePermissionSetting' | 'userPermissionOverride' | 'globalPermissionSetting'
>

export type ProtectedAdminChange =
    | {
        type: 'role'
        role: Role
        permissionKey: AppPermissionKey
        effect: PermissionEffect
    }
    | {
        type: 'user'
        userId: string
        permissionKey: AppPermissionKey
        effect: PermissionEffect
    }

export async function wouldLockOutProtectedAdmins(
    db: PermissionDbClient,
    change: ProtectedAdminChange
) {
    if (change.permissionKey !== PERMISSION_KEYS.PERMISSIONS_MANAGE) {
        return false
    }

    const protectedAdmins = await db.protectedAdmin.findMany({
        where: { protected: true },
        select: { userId: true },
    })

    if (protectedAdmins.length === 0) {
        return false
    }

    const protectedAdminUsers = await db.user.findMany({
        where: {
            id: { in: protectedAdmins.map((admin) => admin.userId) },
            role: 'ADMIN',
            isActive: true,
            deletedAt: null,
        },
        select: {
            id: true,
            role: true,
            isActive: true,
            deletedAt: true,
        },
    })

    if (protectedAdminUsers.length === 0) {
        return true
    }

    const [globalSettings, storedRoleSettings, storedUserOverrides] = await Promise.all([
        db.globalPermissionSetting.findMany({
            select: { key: true, enabled: true, reason: true },
        }),
        db.rolePermissionSetting.findMany({
            select: { role: true, permissionKey: true, effect: true },
        }),
        db.userPermissionOverride.findMany({
            where: { userId: { in: protectedAdminUsers.map((admin) => admin.id) } },
            select: { userId: true, permissionKey: true, effect: true },
        }),
    ])

    const roleSettings: PermissionRoleSetting[] = storedRoleSettings.map((setting) => ({ ...setting }))
    const userOverrides: PermissionUserOverride[] = storedUserOverrides.map((override) => ({ ...override }))

    if (change.type === 'role') {
        const index = roleSettings.findIndex((setting) => (
            setting.role === change.role
            && setting.permissionKey === change.permissionKey
        ))
        if (index >= 0) {
            roleSettings[index] = change
        } else {
            roleSettings.push(change)
        }
    } else {
        const index = userOverrides.findIndex((override) => (
            override.userId === change.userId
            && override.permissionKey === change.permissionKey
        ))
        if (index >= 0) {
            userOverrides[index] = change
        } else {
            userOverrides.push(change)
        }
    }

    return !protectedAdminUsers.some((admin) => evaluatePermission({
        user: admin,
        permissionKey: PERMISSION_KEYS.PERMISSIONS_MANAGE,
        roleSettings,
        userOverrides,
        globalSettings,
    }).allowed)
}
