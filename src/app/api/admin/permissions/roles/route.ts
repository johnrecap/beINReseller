import { NextResponse, type NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import type { Role } from '@/lib/permissions'
import {
    PERMISSION_CATALOG,
    PERMISSION_KEYS,
    defaultRoleHasCatalogPermission,
    type PermissionEffect,
} from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'AGENT', 'USER']

export async function GET(request: NextRequest) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const settings = await prisma.rolePermissionSetting.findMany({
        select: {
            role: true,
            permissionKey: true,
            effect: true,
            reason: true,
            updatedAt: true,
            updatedByUserId: true,
        },
    })
    const settingsByRoleAndKey = new Map(
        settings.map((setting) => [`${setting.role}:${setting.permissionKey}`, setting])
    )

    return NextResponse.json({
        roles: ROLES.map((role) => ({
            role,
            permissions: PERMISSION_CATALOG.map((permission) => {
                const setting = settingsByRoleAndKey.get(`${role}:${permission.key}`)
                const defaultEffect: PermissionEffect = defaultRoleHasCatalogPermission(role, permission.key)
                    ? 'allow'
                    : 'deny'
                const configuredEffect = setting?.effect as PermissionEffect | undefined

                return {
                    key: permission.key,
                    defaultEffect,
                    configuredEffect: configuredEffect ?? null,
                    effectiveEffect: configuredEffect ?? defaultEffect,
                    reason: setting?.reason ?? null,
                    updatedAt: setting?.updatedAt?.toISOString() ?? null,
                    updatedBy: setting?.updatedByUserId ?? null,
                }
            }),
        })),
    })
}
