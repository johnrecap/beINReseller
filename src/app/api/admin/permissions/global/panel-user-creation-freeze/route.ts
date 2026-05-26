import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { PERMISSION_KEYS, PANEL_USER_CREATION_FREEZE_KEY } from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'
import { writePermissionAudit } from '@/lib/permissions/audit'

const updateFreezeSchema = z.object({
    enabled: z.boolean(),
    reason: z.string().trim().max(500).optional().nullable(),
})

export async function PATCH(request: NextRequest) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const body = await request.json()
    const parsed = updateFreezeSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid data', details: parsed.error.flatten() },
            { status: 400 }
        )
    }

    const previous = await prisma.globalPermissionSetting.findUnique({
        where: { key: PANEL_USER_CREATION_FREEZE_KEY },
        select: { enabled: true, reason: true },
    })

    const setting = await prisma.globalPermissionSetting.upsert({
        where: { key: PANEL_USER_CREATION_FREEZE_KEY },
        create: {
            key: PANEL_USER_CREATION_FREEZE_KEY,
            enabled: parsed.data.enabled,
            reason: parsed.data.reason || null,
            updatedByUserId: authResult.user.id,
        },
        update: {
            enabled: parsed.data.enabled,
            reason: parsed.data.reason || null,
            updatedByUserId: authResult.user.id,
        },
        select: {
            key: true,
            enabled: true,
            reason: true,
        },
    })

    await writePermissionAudit(prisma, {
        actorUserId: authResult.user.id,
        targetType: 'global',
        targetId: PANEL_USER_CREATION_FREEZE_KEY,
        oldValue: previous ?? { enabled: false, reason: null },
        newValue: setting,
        result: 'success',
        reason: parsed.data.reason || null,
    })

    return NextResponse.json({
        success: true,
        setting,
    })
}
