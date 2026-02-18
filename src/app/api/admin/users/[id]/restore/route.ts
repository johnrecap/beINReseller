import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

export async function POST(
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
        const userToRestore = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                deletedAt: true,
                purgedAt: true
            }
        })

        if (!userToRestore) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (!userToRestore.deletedAt) {
            return NextResponse.json({ error: 'User is not deleted' }, { status: 400 })
        }

        if (userToRestore.purgedAt) {
            return NextResponse.json({ error: 'Purged users cannot be restored' }, { status: 400 })
        }

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id },
                data: {
                    deletedAt: null,
                    deletedBalance: null,
                    deletedByUserId: null,
                    isActive: true
                }
            })

            await tx.activityLog.create({
                data: {
                    userId: actor.id,
                    action: 'ADMIN_RESTORE_USER',
                    details: {
                        restoredUserId: id,
                        restoredUsername: userToRestore.username
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })
        })

        return NextResponse.json({
            success: true,
            message: 'User restored successfully'
        })
    } catch (error) {
        console.error('Admin restore user error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
