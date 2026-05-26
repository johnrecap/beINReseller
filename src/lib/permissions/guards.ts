import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import type { AuthenticatedUser } from '@/lib/auth-utils'
import {
    evaluatePermission,
    getPanelUserCreationBlock,
    type PermissionEvaluationResult,
} from './evaluator'
import type { AppPermissionKey } from './catalog'

export const PERMISSION_DENIED_RESPONSE = {
    error: 'You do not have permission to perform this action.',
    code: 'PERMISSION_DENIED',
} as const

export const PANEL_USER_CREATION_DISABLED_RESPONSE = {
    error: 'User creation is currently disabled by the administrator.',
    code: 'PANEL_USER_CREATION_DISABLED',
} as const

export function permissionDeniedResponse(permissionKey: AppPermissionKey, status = 403) {
    return NextResponse.json(
        {
            ...PERMISSION_DENIED_RESPONSE,
            permissionKey,
        },
        { status }
    )
}

export async function loadPermissionInputsForUser(userId: string) {
    const [globalSettings, roleSettings, userOverrides] = await Promise.all([
        prisma.globalPermissionSetting.findMany({
            select: { key: true, enabled: true, reason: true },
        }),
        prisma.rolePermissionSetting.findMany({
            select: { role: true, permissionKey: true, effect: true },
        }),
        prisma.userPermissionOverride.findMany({
            where: { userId },
            select: { userId: true, permissionKey: true, effect: true },
        }),
    ])

    return { globalSettings, roleSettings, userOverrides }
}

export async function requirePermissionAPIWithMobile(
    request: NextRequest,
    permissionKey: AppPermissionKey
): Promise<
    | { user: AuthenticatedUser; evaluation: PermissionEvaluationResult }
    | { response: NextResponse; status: number }
> {
    const authResult = await requireAuthAPI(request)
    if ('error' in authResult) {
        const status = authResult.status ?? 401
        return {
            response: NextResponse.json({ error: authResult.error }, { status }),
            status,
        }
    }

    const inputs = await loadPermissionInputsForUser(authResult.user.id)
    const evaluation = evaluatePermission({
        user: authResult.user,
        permissionKey,
        ...inputs,
    })

    if (!evaluation.allowed) {
        if (evaluation.code === 'PANEL_USER_CREATION_DISABLED') {
            return {
                response: NextResponse.json(PANEL_USER_CREATION_DISABLED_RESPONSE, { status: 403 }),
                status: 403,
            }
        }

        return {
            response: permissionDeniedResponse(permissionKey),
            status: 403,
        }
    }

    return { user: authResult.user, evaluation }
}

export async function getPanelUserCreationFreeze() {
    const globalSettings = await prisma.globalPermissionSetting.findMany({
        where: { key: 'panel_user_creation_freeze' },
        select: { key: true, enabled: true, reason: true },
    })

    return getPanelUserCreationBlock(globalSettings)
}
