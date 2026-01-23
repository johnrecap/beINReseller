import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPI } from '@/lib/auth-utils'

export async function GET(request: Request) {
    try {
        const authResult = await requireRoleAPI('MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: manager } = authResult
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')

        // Get user IDs linked to this manager
        const managerUserLinks = await prisma.managerUser.findMany({
            where: { managerId: manager.id },
            select: { userId: true }
        })
        const userIds = managerUserLinks.map(link => link.userId)

        if (userIds.length === 0) {
            return NextResponse.json({
                users: [],
                total: 0,
                page,
                limit,
                totalPages: 0
            })
        }

        // Get deleted users from those linked to this manager
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where: {
                    id: { in: userIds },
                    deletedAt: { not: null },
                    deletedByUserId: manager.id
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true,
                    deletedBalance: true,
                    deletedAt: true,
                    createdAt: true,
                    _count: { select: { transactions: true, operations: true } },
                },
                orderBy: { deletedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.user.count({
                where: {
                    id: { in: userIds },
                    deletedAt: { not: null },
                    deletedByUserId: manager.id
                }
            })
        ])

        return NextResponse.json({
            users: users.map(u => ({
                ...u,
                transactionCount: u._count.transactions,
                operationCount: u._count.operations
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('List manager deleted users error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
