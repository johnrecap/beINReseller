import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

interface RouteParams {
    params: Promise<{ id: string }>
}

// POST /api/admin/bein-accounts/[id]/toggle - Toggle account active status
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const account = await prisma.beinAccount.findUnique({
            where: { id }
        })

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }

        // Toggle status
        const updatedAccount = await prisma.beinAccount.update({
            where: { id },
            data: {
                isActive: !account.isActive,
                // Reset failures when reactivating
                ...(account.isActive === false && {
                    consecutiveFailures: 0,
                    cooldownUntil: null
                })
            }
        })

        return NextResponse.json({
            success: true,
            account: {
                id: updatedAccount.id,
                username: updatedAccount.username,
                isActive: updatedAccount.isActive
            },
            message: updatedAccount.isActive ? 'Account activated' : 'Account deactivated'
        })

    } catch (error) {
        console.error('Toggle beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
