import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'

function buildAnonymizedIdentity(userId: string): { username: string; email: string; suffix: string } {
    const suffix = `${Date.now().toString(36)}_${userId.slice(-8)}`
    return {
        username: `purged_${suffix}`,
        email: `purged_${suffix}@deleted.local`,
        suffix
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const actor = authResult.user
        const userToPurge = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                deletedAt: true,
                purgedAt: true
            }
        })

        if (!userToPurge) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (!userToPurge.deletedAt) {
            return NextResponse.json({ error: 'User must be deleted before permanent delete' }, { status: 400 })
        }

        if (userToPurge.purgedAt) {
            return NextResponse.json({ error: 'User already permanently deleted' }, { status: 400 })
        }

        const anonymized = buildAnonymizedIdentity(id)
        const disabledPasswordHash = await bcrypt.hash(`purged_${anonymized.suffix}`, 10)

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id },
                data: {
                    username: anonymized.username,
                    email: anonymized.email,
                    passwordHash: disabledPasswordHash,
                    balance: 0,
                    isActive: false,
                    purgedAt: new Date(),
                    purgedByUserId: actor.id
                }
            })

            await tx.activityLog.create({
                data: {
                    userId: actor.id,
                    action: 'ADMIN_PURGE_USER',
                    details: {
                        purgedUserId: id,
                        originalUsername: userToPurge.username
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })
        })

        return NextResponse.json({
            success: true,
            message: 'User permanently deleted'
        })
    } catch (error) {
        console.error('Admin permanent delete user error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
