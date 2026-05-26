import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { PERMISSION_KEYS, PANEL_USER_CREATION_FREEZE_KEY } from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'

export async function GET(request: NextRequest) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const setting = await prisma.globalPermissionSetting.findUnique({
        where: { key: PANEL_USER_CREATION_FREEZE_KEY },
        select: {
            enabled: true,
            reason: true,
            updatedAt: true,
            updatedByUserId: true,
        },
    })

    return NextResponse.json({
        settings: {
            [PANEL_USER_CREATION_FREEZE_KEY]: {
                enabled: setting?.enabled ?? false,
                reason: setting?.reason ?? null,
                updatedAt: setting?.updatedAt?.toISOString() ?? null,
                updatedBy: setting?.updatedByUserId ?? null,
            },
        },
    })
}
