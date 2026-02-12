import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        // Count distributors (ADMIN + MANAGER) and users (USER)
        const [distributors, users] = await Promise.all([
            prisma.user.count({
                where: {
                    deletedAt: null,
                    role: { in: ['ADMIN', 'MANAGER'] }
                }
            }),
            prisma.user.count({
                where: {
                    deletedAt: null,
                    role: 'USER'
                }
            })
        ])

        return NextResponse.json({ distributors, users })

    } catch (error) {
        console.error('Counts API error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
