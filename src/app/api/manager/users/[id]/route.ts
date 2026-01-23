import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPI } from '@/lib/auth-utils'

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const authResult = await requireRoleAPI('MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: manager } = authResult

        // Check if user exists
        const userToDelete = await prisma.user.findUnique({ where: { id } })
        if (!userToDelete) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        if (userToDelete.deletedAt) {
            return NextResponse.json({ error: 'المستخدم محذوف بالفعل' }, { status: 400 })
        }

        // Check if this user belongs to this manager
        const managerUserLink = await prisma.managerUser.findFirst({
            where: {
                managerId: manager.id,
                userId: id
            }
        })

        if (!managerUserLink) {
            return NextResponse.json({ error: 'ليس لديك صلاحية حذف هذا المستخدم' }, { status: 403 })
        }

        // Soft delete - preserve data and mark as deleted
        await prisma.user.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                deletedBalance: userToDelete.balance,
                deletedByUserId: manager.id,
                isActive: false,
            }
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: manager.id,
                action: 'MANAGER_DELETE_USER',
                details: `Deleted user: ${userToDelete.username} (balance: ${userToDelete.balance})`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, message: 'تم حذف المستخدم بنجاح' })

    } catch (error) {
        console.error('Manager delete user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
