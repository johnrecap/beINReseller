import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user } = authResult
        const managerId = user.id
        const userRole = user.role

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `manager:${user.id}`,
            RATE_LIMITS.manager
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

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

        // 3. Get Stats (including fresh manager balance from DB)
        const [usersCount, actionsCount, totalBalance, managerData] = await Promise.all([
            prisma.managerUser.count({ where: whereManager }),
            prisma.userAction.count({ where: whereManager }),
            // Calculate total balance of managed users
            prisma.managerUser.findMany({
                where: whereManager,
                select: { user: { select: { balance: true } } }
            }).then(users => users.reduce((acc, curr) => acc + curr.user.balance, 0)),
            // Fetch manager's current balance from DB (not from session token)
            prisma.user.findUnique({
                where: { id: managerId },
                select: { balance: true }
            })
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
                managerBalance: managerData?.balance ?? 0, // Fresh balance from DB
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
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
