import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'

const releaseSchema = z.object({
    ownerUserId: z.string().min(1),
    sourceId: z.string().trim().min(1).optional(),
    note: z.string().trim().max(500).optional().or(z.literal('')),
})

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = releaseSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid release data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const owner = await prisma.user.findUnique({
            where: { id: parsed.data.ownerUserId },
            select: { id: true, username: true, role: true, deletedAt: true },
        })

        if (!owner || owner.deletedAt) {
            return NextResponse.json({ error: 'Point owner not found' }, { status: 404 })
        }

        const note = parsed.data.note?.trim() || null
        const result = await prisma.$transaction(async (tx) => {
            const pendingEntries = await tx.pointLedgerEntry.findMany({
                where: {
                    ownerUserId: owner.id,
                    status: 'PENDING',
                    ...(parsed.data.sourceId ? { sourceId: parsed.data.sourceId } : {}),
                },
                select: { id: true, points: true },
            })

            if (pendingEntries.length === 0) {
                return { releasedCount: 0, releasedPoints: 0 }
            }

            const entryIds = pendingEntries.map((entry) => entry.id)
            const releasedPoints = pendingEntries.reduce((sum, entry) => sum + entry.points, 0)

            const updated = await tx.pointLedgerEntry.updateMany({
                where: {
                    id: { in: entryIds },
                    status: 'PENDING',
                },
                data: {
                    status: 'AVAILABLE',
                    releasedAt: new Date(),
                    releasedByAdminId: authResult.user.id,
                    notes: note ? `Released by admin: ${note}` : 'Released by admin',
                },
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_POINTS_RELEASED',
                    targetId: owner.id,
                    targetType: 'PointLedgerEntry',
                    details: {
                        ownerUsername: owner.username,
                        ownerRole: owner.role,
                        sourceId: parsed.data.sourceId || null,
                        requestedEntries: entryIds.length,
                        releasedCount: updated.count,
                        releasedPoints,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    userAgent: request.headers.get('user-agent'),
                },
            })

            return { releasedCount: updated.count, releasedPoints }
        })

        return NextResponse.json({ success: true, ...result })
    } catch (error) {
        console.error('Admin points release error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
