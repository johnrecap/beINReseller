import { NextResponse, type NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { PERMISSION_KEYS } from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'

export async function GET(request: NextRequest) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    const limitParam = new URL(request.url).searchParams.get('limit')
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 25))
    const events = await prisma.permissionAuditEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
            id: true,
            actorUserId: true,
            targetType: true,
            targetId: true,
            permissionKey: true,
            result: true,
            reason: true,
            createdAt: true,
        },
    })

    return NextResponse.json({
        events: events.map((event) => ({
            ...event,
            createdAt: event.createdAt.toISOString(),
        })),
    })
}
