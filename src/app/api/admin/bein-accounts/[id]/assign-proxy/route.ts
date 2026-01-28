import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

interface RouteParams {
    params: Promise<{ id: string }>
}

// PUT /api/admin/bein-accounts/[id]/assign-proxy - Assign or unassign proxy to account
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json()
        const { proxyId } = body

        // Validate account exists
        const account = await prisma.beinAccount.findUnique({
            where: { id },
            select: { id: true, username: true, label: true }
        })

        if (!account) {
            return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
        }

        // If proxyId is provided, validate it exists and is active
        if (proxyId !== null && proxyId !== undefined) {
            const proxy = await prisma.proxy.findUnique({
                where: { id: proxyId }
            })

            if (!proxy) {
                return NextResponse.json({ error: 'البروكسي غير موجود' }, { status: 404 })
            }

            if (!proxy.isActive) {
                return NextResponse.json({ error: 'لا يمكن تعيين بروكسي معطل' }, { status: 400 })
            }
        }

        // Update account with proxy
        const updatedAccount = await prisma.beinAccount.update({
            where: { id },
            data: {
                proxyId: proxyId || null
            },
            include: {
                proxy: {
                    select: {
                        id: true,
                        label: true,
                        isActive: true
                    }
                }
            }
        })

        const proxyLabel = updatedAccount.proxy?.label || 'بدون بروكسي'

        return NextResponse.json({
            success: true,
            message: `تم تعيين "${proxyLabel}" للحساب ${account.username}`,
            account: {
                id: updatedAccount.id,
                username: updatedAccount.username,
                label: updatedAccount.label,
                proxyId: updatedAccount.proxyId,
                proxy: updatedAccount.proxy
            }
        })

    } catch (error) {
        console.error('Assign proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
