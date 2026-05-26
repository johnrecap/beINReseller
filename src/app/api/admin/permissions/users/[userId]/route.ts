import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { PERMISSION_KEYS, isKnownPermissionKey } from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'
import { writePermissionAudit } from '@/lib/permissions/audit'
import { wouldLockOutProtectedAdmins } from '@/lib/permissions/protected-admin'

const updateUserOverrideSchema = z.object({
    permissionKey: z.string(),
    effect: z.enum(['allow', 'deny']),
    reason: z.string().trim().max(500).optional().nullable(),
})

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const { userId } = await params
    const overrides = await prisma.userPermissionOverride.findMany({
        where: { userId },
        select: {
            userId: true,
            permissionKey: true,
            effect: true,
            reason: true,
            updatedAt: true,
            updatedByUserId: true,
        },
        orderBy: { permissionKey: 'asc' },
    })

    return NextResponse.json({
        userId,
        overrides: overrides.map((override) => ({
            ...override,
            updatedAt: override.updatedAt.toISOString(),
            updatedBy: override.updatedByUserId,
            updatedByUserId: undefined,
        })),
    })
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const { userId } = await params
    const body = await request.json()
    const parsed = updateUserOverrideSchema.safeParse(body)
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

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, deletedAt: true },
    })
    if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (targetUser.deletedAt) {
        return NextResponse.json({ error: 'Cannot add overrides for deleted users' }, { status: 400 })
    }

    const wouldLockOut = await wouldLockOutProtectedAdmins(prisma, {
        type: 'user',
        userId,
        permissionKey: parsed.data.permissionKey,
        effect: parsed.data.effect,
    })
    if (wouldLockOut) {
        await writePermissionAudit(prisma, {
            actorUserId: authResult.user.id,
            targetType: 'user',
            targetId: userId,
            permissionKey: parsed.data.permissionKey,
            oldValue: null,
            newValue: {
                userId,
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

    const previous = await prisma.userPermissionOverride.findUnique({
        where: {
            userId_permissionKey: {
                userId,
                permissionKey: parsed.data.permissionKey,
            },
        },
        select: { effect: true, reason: true },
    })

    const override = await prisma.userPermissionOverride.upsert({
        where: {
            userId_permissionKey: {
                userId,
                permissionKey: parsed.data.permissionKey,
            },
        },
        create: {
            userId,
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
            userId: true,
            permissionKey: true,
            effect: true,
            reason: true,
        },
    })

    await writePermissionAudit(prisma, {
        actorUserId: authResult.user.id,
        targetType: 'user',
        targetId: userId,
        permissionKey: parsed.data.permissionKey,
        oldValue: previous,
        newValue: override,
        result: 'success',
        reason: parsed.data.reason || null,
    })

    return NextResponse.json({
        success: true,
        userId: override.userId,
        permissionKey: override.permissionKey,
        effect: override.effect,
    })
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const { userId } = await params
    const permissionKey = new URL(request.url).searchParams.get('permissionKey')
    if (!permissionKey || !isKnownPermissionKey(permissionKey)) {
        return NextResponse.json(
            { error: 'Unknown permission key', code: 'UNKNOWN_PERMISSION' },
            { status: 400 }
        )
    }

    const previous = await prisma.userPermissionOverride.findUnique({
        where: {
            userId_permissionKey: {
                userId,
                permissionKey,
            },
        },
        select: { effect: true, reason: true },
    })

    await prisma.userPermissionOverride.deleteMany({
        where: { userId, permissionKey },
    })

    await writePermissionAudit(prisma, {
        actorUserId: authResult.user.id,
        targetType: 'user',
        targetId: userId,
        permissionKey,
        oldValue: previous,
        newValue: null,
        result: 'success',
    })

    return NextResponse.json({ success: true })
}
