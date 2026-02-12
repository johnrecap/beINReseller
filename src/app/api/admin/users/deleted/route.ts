import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')

        const where = {
            deletedAt: { not: null }
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true,
                    deletedBalance: true,
                    deletedAt: true,
                    deletedByUserId: true,
                    createdAt: true,
                    _count: { select: { transactions: true, operations: true } },
                },
                orderBy: { deletedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.user.count({ where }),
        ])

        // Get names of users who deleted
        const deletedByIds = users
            .map(u => u.deletedByUserId)
            .filter((id): id is string => id !== null)

        const deletedByUsers = deletedByIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: deletedByIds } },
                select: { id: true, username: true }
            })
            : []

        const deletedByMap = new Map(deletedByUsers.map(u => [u.id, u.username]))

        return NextResponse.json({
            users: users.map(u => ({
                ...u,
                deletedByUsername: u.deletedByUserId ? deletedByMap.get(u.deletedByUserId) || 'Unknown' : null,
                transactionCount: u._count.transactions,
                operationCount: u._count.operations
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('List deleted users error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
