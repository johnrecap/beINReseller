import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import type { Role } from '@/lib/permissions'
import { PERMISSION_KEYS, isKnownPermissionKey } from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'
import { writePermissionAudit } from '@/lib/permissions/audit'
import { wouldLockOutProtectedAdmins } from '@/lib/permissions/protected-admin'

const roleSchema = z.enum(['ADMIN', 'MANAGER', 'AGENT', 'USER'])
const updateRolePermissionSchema = z.object({
    permissionKey: z.string(),
    effect: z.enum(['allow', 'deny']),
    reason: z.string().trim().max(500).optional().nullable(),
})

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ role: string }> }
) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const { role: rawRole } = await params
    const roleResult = roleSchema.safeParse(rawRole.toUpperCase())
    if (!roleResult.success) {
        return NextResponse.json({ error: 'Invalid role', code: 'INVALID_ROLE' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = updateRolePermissionSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid data', details: parsed.error.flatten() },
            { status: 400 }
        )
    }

    if (!isKnownPermissionKey(parsed.data.permissionKey)) {
        return NextResponse.json(
            { error: 'Unknown permission key', code: 'UNKNOWN_PERMISSION' },
            { status: 400 }
        )
    }

    const role = roleResult.data as Role
    const wouldLockOut = await wouldLockOutProtectedAdmins(prisma, {
        type: 'role',
        role,
        permissionKey: parsed.data.permissionKey,
        effect: parsed.data.effect,
    })
    if (wouldLockOut) {
        await writePermissionAudit(prisma, {
            actorUserId: authResult.user.id,
            targetType: 'role',
            targetId: role,
            permissionKey: parsed.data.permissionKey,
            oldValue: null,
            newValue: {
                role,
                permissionKey: parsed.data.permissionKey,
                effect: parsed.data.effect,
            },
            result: 'rejected',
            reason: 'Protected admin lockout prevention',
        })

        return NextResponse.json(
            { error: 'This change would lock out protected admins', code: 'PROTECTED_ADMIN_LOCKOUT' },
            { status: 409 }
        )
    }

    const previous = await prisma.rolePermissionSetting.findUnique({
        where: {
            role_permissionKey: {
                role,
                permissionKey: parsed.data.permissionKey,
            },
        },
        select: { effect: true, reason: true },
    })

    const setting = await prisma.rolePermissionSetting.upsert({
        where: {
            role_permissionKey: {
                role,
                permissionKey: parsed.data.permissionKey,
            },
        },
        create: {
            role,
            permissionKey: parsed.data.permissionKey,
            effect: parsed.data.effect,
            reason: parsed.data.reason || null,
            updatedByUserId: authResult.user.id,
        },
        update: {
            effect: parsed.data.effect,
            reason: parsed.data.reason || null,
            updatedByUserId: authResult.user.id,
        },
        select: {
            role: true,
            permissionKey: true,
            effect: true,
            reason: true,
        },
    })

    await writePermissionAudit(prisma, {
        actorUserId: authResult.user.id,
        targetType: 'role',
        targetId: role,
        permissionKey: parsed.data.permissionKey,
        oldValue: previous,
        newValue: setting,
        result: 'success',
        reason: parsed.data.reason || null,
    })

    return NextResponse.json({
        success: true,
        role: setting.role,
        permissionKey: setting.permissionKey,
        effect: setting.effect,
    })
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ role: string }> }
) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const { role: rawRole } = await params
    const roleResult = roleSchema.safeParse(rawRole.toUpperCase())
    if (!roleResult.success) {
        return NextResponse.json({ error: 'Invalid role', code: 'INVALID_ROLE' }, { status: 400 })
    }

    const permissionKey = new URL(request.url).searchParams.get('permissionKey')
    if (!permissionKey || !isKnownPermissionKey(permissionKey)) {
        return NextResponse.json(
            { error: 'Unknown permission key', code: 'UNKNOWN_PERMISSION' },
            { status: 400 }
        )
    }

    const role = roleResult.data as Role
    const previous = await prisma.rolePermissionSetting.findUnique({
        where: {
            role_permissionKey: {
                role,
                permissionKey,
            },
        },
        select: { effect: true, reason: true },
    })

    await prisma.rolePermissionSetting.deleteMany({
        where: { role, permissionKey },
    })

    await writePermissionAudit(prisma, {
        actorUserId: authResult.user.id,
        targetType: 'role',
        targetId: role,
        permissionKey,
        oldValue: previous,
        newValue: null,
        result: 'success',
    })

    return NextResponse.json({ success: true })
}
