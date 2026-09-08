import prisma from '@/lib/prisma'

// Call only after the page/API has resolved the current authorized actor.
export async function getManagerDashboardData(actor: { id: string; role: string }) {
    const whereManager = actor.role === 'ADMIN' ? {} : { managerId: actor.id }
    const whereUsers = { ...whereManager, user: { deletedAt: null } }
    const [managedUsers, recentActions, usersCount, actionsCount, balances, managerData, actionsByType] = await Promise.all([
        prisma.managerUser.findMany({
            where: whereUsers,
            include: { user: { select: {
                id: true, username: true, email: true, isActive: true, balance: true,
                createdAt: true, lastLoginAt: true, _count: { select: { operations: true } },
            } } },
            orderBy: { createdAt: 'desc' }, take: 10,
        }),
        prisma.userAction.findMany({
            where: whereManager, include: { user: { select: { username: true } } },
            orderBy: { createdAt: 'desc' }, take: 20,
        }),
        prisma.managerUser.count({ where: whereUsers }),
        prisma.userAction.count({ where: whereManager }),
        prisma.managerUser.findMany({ where: whereUsers, select: { user: { select: { balance: true } } } }),
        prisma.user.findUnique({ where: { id: actor.id }, select: { balance: true } }),
        prisma.userAction.groupBy({ by: ['actionType'], where: whereManager, _count: true }),
    ])
    return {
        stats: {
            usersCount, actionsCount,
            totalBalance: balances.reduce((sum, record) => sum + record.user.balance, 0),
            managerBalance: managerData?.balance ?? 0,
            actionsByType,
        },
        recentUsers: managedUsers.map(record => ({
            ...record.user,
            createdAt: record.user.createdAt.toISOString(),
            lastLoginAt: record.user.lastLoginAt?.toISOString() ?? null,
            linkedAt: record.createdAt.toISOString(),
            operationsCount: record.user._count.operations,
        })),
        recentActions: recentActions.map(action => ({ ...action, createdAt: action.createdAt.toISOString() })),
    }
}

export type ManagerDashboardData = Awaited<ReturnType<typeof getManagerDashboardData>>
