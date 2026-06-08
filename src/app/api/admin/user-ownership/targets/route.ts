import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const owners = await prisma.user.findMany({
            where: {
                role: { in: ['ADMIN', 'MANAGER', 'AGENT'] },
                isActive: true,
                deletedAt: null,
            },
            orderBy: [{ role: 'asc' }, { username: 'asc' }],
            select: {
                id: true,
                username: true,
                role: true,
                agentProfile: {
                    select: {
                        displayName: true,
                        defaultSourceGroup: true,
                        isActive: true,
                    },
                },
            },
        })

        return NextResponse.json({
            targets: {
                admins: owners
                    .filter((owner) => owner.role === 'ADMIN')
                    .map((owner) => ({
                        id: owner.id,
                        label: owner.username,
                        username: owner.username,
                    })),
                managers: owners
                    .filter((owner) => owner.role === 'MANAGER')
                    .map((owner) => ({
                        id: owner.id,
                        label: owner.username,
                        username: owner.username,
                    })),
                agents: owners
                    .filter((owner) => owner.role === 'AGENT' && owner.agentProfile?.isActive !== false)
                    .map((owner) => ({
                        id: owner.id,
                        label: owner.agentProfile?.displayName || owner.username,
                        username: owner.username,
                        defaultSourceGroup: owner.agentProfile?.defaultSourceGroup || null,
                    })),
            },
        })
    } catch (error) {
        console.error('List user ownership targets error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
