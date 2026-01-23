import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPI } from '@/lib/auth-utils'

export async function GET() {
    try {
        const authResult = await requireRoleAPI('MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user } = authResult
        const managerId = user.id
        const userRole = user.role

        // IDOR Protection: 
        // Admin sees all, Manager sees only their linked users
        const whereManager = userRole === 'ADMIN' ? {} : { managerId }

        // 1. Get Managed Users
        const managedUsers = await prisma.managerUser.findMany({
            where: whereManager,
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        isActive: true,
                        balance: true,
                        createdAt: true,
                        lastLoginAt: true,
                        _count: {
                            select: {
                                operations: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 10 // Recent 10 users
        })

        // 2. Get Recent Actions
        const recentActions = await prisma.userAction.findMany({
            where: whereManager,
            include: {
                user: {
                    select: {
                        username: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        })

        // 3. Get Stats
        const [usersCount, actionsCount, totalBalance] = await Promise.all([
            prisma.managerUser.count({ where: whereManager }),
            prisma.userAction.count({ where: whereManager }),
            // Calculate total balance of managed users
            prisma.managerUser.findMany({
                where: whereManager,
                select: { user: { select: { balance: true } } }
            }).then(users => users.reduce((acc, curr) => acc + curr.user.balance, 0))
        ])

        // Group actions by type for charts
        const actionsByType = await prisma.userAction.groupBy({
            by: ['actionType'],
            where: whereManager,
            _count: true
        })

        return NextResponse.json({
            stats: {
                usersCount,
                actionsCount,
                totalBalance,
                managerBalance: user.balance, // Manager's own balance
                actionsByType
            },
            recentUsers: managedUsers.map(record => ({
                ...record.user,
                linkedAt: record.createdAt
            })),
            recentActions
        })

    } catch (error) {
        console.error('Manager dashboard error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
