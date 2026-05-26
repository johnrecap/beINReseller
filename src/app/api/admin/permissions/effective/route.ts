import { NextResponse, type NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { PERMISSION_CATALOG, PERMISSION_KEYS } from '@/lib/permissions/catalog'
import { evaluatePermission } from '@/lib/permissions/evaluator'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'

export async function GET(request: NextRequest) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const userId = new URL(request.url).searchParams.get('userId')
    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            role: true,
            isActive: true,
            deletedAt: true,
        },
    })
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

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

    return NextResponse.json({
        userId: user.id,
        role: user.role,
        permissions: PERMISSION_CATALOG.map((permission) => {
            const result = evaluatePermission({
                user,
                permissionKey: permission.key,
                roleSettings,
                userOverrides,
                globalSettings,
            })

            return {
                key: permission.key,
                allowed: result.allowed,
                source: result.source,
                globalBlock: result.globalBlock ?? null,
                code: result.code ?? null,
            }
        }),
    })
}
