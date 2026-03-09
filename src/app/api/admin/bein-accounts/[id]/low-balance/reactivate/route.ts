import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const account = await prisma.beinAccount.findUnique({
            where: { id },
            select: { id: true, username: true, label: true }
        })

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }

        await prisma.beinAccount.update({
            where: { id },
            data: {
                isActive: true,
            }
        })

        console.log(`[Admin] Reactivated low-balance account: ${account.label || account.username}`)

        return NextResponse.json({
            success: true,
            message: `Account "${account.label || account.username}" reactivated successfully`
        })
    } catch (error) {
        console.error('Reactivate beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
