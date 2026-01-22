import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

interface RouteParams {
    params: Promise<{ id: string }>
}

// PUT /api/admin/proxies/[id] - Update proxy
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()
        const { label, isActive } = body

        if (!id) {
            return NextResponse.json({ error: 'ID مطلوب' }, { status: 400 })
        }

        const proxy = await prisma.proxy.update({
            where: { id },
            data: {
                label,
                isActive
            }
        })

        return NextResponse.json({
            success: true,
            proxy
        })

    } catch (error) {
        console.error('Update proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/admin/proxies/[id] - Delete proxy
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params

        // Check if used by accounts
        const usage = await prisma.beinAccount.count({
            where: { proxyId: id }
        })

        if (usage > 0) {
            return NextResponse.json(
                { error: `لا يمكن حذف هذا البروكسي لأنه مستخدم بواسطة ${usage} حسابات` },
                { status: 400 }
            )
        }

        await prisma.proxy.delete({
            where: { id }
        })

        return NextResponse.json({
            success: true,
            message: 'تم حذف البروكسي بنجاح'
        })

    } catch (error) {
        console.error('Delete proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
