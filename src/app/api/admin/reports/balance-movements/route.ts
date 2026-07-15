import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    BALANCE_MOVEMENT_EXPORT_LIMIT,
    buildBalanceMovementReportWhere,
    buildBalanceMovementSummaryWheres,
    buildBalanceMovementUserOptionWhere,
    getBalanceMovementBucket,
    getBalanceMovementSource,
    normalizeMoney,
    parseBalanceMovementReportFilters,
} from '@/lib/balance-movements/report'
import { utcIsoToCairoDateInput } from '@/lib/egypt-time'
import { classifyCurrentUserOwner } from '@/lib/users/ownership'

const ownershipUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    isActive: true,
    deletedAt: true,
    createdBy: {
        select: {
            id: true,
            username: true,
            role: true,
            isActive: true,
            deletedAt: true,
        },
    },
    managerLink: {
        select: {
            id: true,
            managerId: true,
            manager: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                },
            },
        },
    },
    agentAssignmentAsUser: {
        where: { isActive: true },
        select: {
            id: true,
            agentId: true,
            sourceGroup: true,
            whatsappGroupUrl: true,
            isActive: true,
            agent: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                    agentProfile: {
                        select: {
                            displayName: true,
                            isActive: true,
                        },
                    },
                },
            },
        },
    },
} as const

type OwnershipUser = Prisma.UserGetPayload<{ select: typeof ownershipUserSelect }>

const movementRowSelect = {
    id: true,
    userId: true,
    adminId: true,
    amount: true,
    balanceAfter: true,
    type: true,
    notes: true,
    createdAt: true,
    operationId: true,
    user: { select: ownershipUserSelect },
    admin: {
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
        },
    },
    creditRequest: {
        select: {
            id: true,
            requestNumber: true,
        },
    },
    pointCashRedemption: {
        select: {
            id: true,
            pointsConverted: true,
            balanceAmountUsd: true,
        },
    },
} as const

function currentOwner(user: OwnershipUser) {
    const owner = classifyCurrentUserOwner({
        user,
        managerLinks: user.managerLink,
        activeAssignments: user.agentAssignmentAsUser,
    })

    return {
        type: owner.ownerType === 'LEGACY_ADMIN' ? 'ADMIN' : owner.ownerType,
        id: owner.ownerId,
        label: owner.ownerLabel,
        isLegacyFallback: owner.isLegacyFallback,
        hasConflict: owner.conflicts.hasMixedCurrentOwners,
    }
}

function mapMovementRow(row: Prisma.TransactionGetPayload<{ select: typeof movementRowSelect }>) {
    const source = getBalanceMovementSource({
        admin: row.admin,
        creditRequest: row.creditRequest,
        pointCashRedemption: row.pointCashRedemption,
        notes: row.notes,
    })
    const bucket = getBalanceMovementBucket({
        recipientRole: row.user.role,
        actorRole: row.admin?.role ?? null,
        sourceKey: source.key,
    })

    return {
        id: row.id,
        amount: row.amount,
        balanceAfter: row.balanceAfter,
        type: row.type,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        createdAtCairoDate: utcIsoToCairoDateInput(row.createdAt.toISOString()),
        operationId: row.operationId,
        source,
        bucket,
        recipient: {
            id: row.user.id,
            username: row.user.username,
            email: row.user.email,
            role: row.user.role,
            currentOwner: currentOwner(row.user),
        },
        actor: row.admin
            ? {
                id: row.admin.id,
                username: row.admin.username,
                email: row.admin.email,
                role: row.admin.role,
            }
            : null,
        creditRequest: row.creditRequest,
        pointCashRedemption: row.pointCashRedemption,
    }
}

function mapUserOption(user: OwnershipUser) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        currentOwner: currentOwner(user),
    }
}

async function summarizeMoney(where: Prisma.TransactionWhereInput) {
    const aggregate = await prisma.transaction.aggregate({
        where,
        _sum: { amount: true },
        _count: { _all: true },
        _max: { createdAt: true },
    })

    return {
        amount: normalizeMoney(aggregate._sum.amount ?? 0),
        count: aggregate._count._all,
        lastMovementAt: aggregate._max.createdAt?.toISOString() ?? null,
    }
}

async function buildSummary(where: Prisma.TransactionWhereInput) {
    const splitWheres = buildBalanceMovementSummaryWheres(where)
    const [
        total,
        adminToManagers,
        adminToUsers,
        managerToUsers,
        recipientGroups,
        actorGroups,
    ] = await Promise.all([
        summarizeMoney(where),
        summarizeMoney(splitWheres.adminToManagers),
        summarizeMoney(splitWheres.adminToUsers),
        summarizeMoney(splitWheres.managerToUsers),
        prisma.transaction.groupBy({ by: ['userId'], where }),
        prisma.transaction.groupBy({
            by: ['adminId'],
            where: { AND: [where, { adminId: { not: null } }] },
        }),
    ])

    const splitAmount = normalizeMoney(
        adminToManagers.amount + adminToUsers.amount + managerToUsers.amount
    )
    const splitCount = adminToManagers.count + adminToUsers.count + managerToUsers.count

    return {
        totalAmount: total.amount,
        movementCount: total.count,
        recipientsCount: recipientGroups.length,
        actorsCount: actorGroups.length,
        averageAmount: total.count > 0 ? normalizeMoney(total.amount / total.count) : 0,
        lastMovementAt: total.lastMovementAt,
        adminToManagersAmount: adminToManagers.amount,
        adminToManagersCount: adminToManagers.count,
        adminToUsersAmount: adminToUsers.amount,
        adminToUsersCount: adminToUsers.count,
        managerToUsersAmount: managerToUsers.amount,
        managerToUsersCount: managerToUsers.count,
        systemAmount: normalizeMoney(total.amount - splitAmount),
        systemCount: Math.max(0, total.count - splitCount),
    }
}

function isExportAll(searchParams: URLSearchParams): boolean {
    return searchParams.get('export') === 'all'
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const searchParams = new URL(request.url).searchParams
        const exportAll = isExportAll(searchParams)
        const filters = parseBalanceMovementReportFilters(searchParams)
        const where = buildBalanceMovementReportWhere(filters)
        const userOptionWhere = buildBalanceMovementUserOptionWhere(filters)
        const skip = exportAll ? 0 : (filters.page - 1) * filters.limit

        const [total, summary, managers, adminOwners, agents, userOptions] = await Promise.all([
            prisma.transaction.count({ where }),
            buildSummary(where),
            prisma.user.findMany({
                where: { role: 'MANAGER', deletedAt: null },
                orderBy: { username: 'asc' },
                take: 250,
                select: { id: true, username: true, email: true, role: true },
            }),
            prisma.user.findMany({
                where: { role: 'ADMIN', deletedAt: null },
                orderBy: { username: 'asc' },
                take: 50,
                select: { id: true, username: true, email: true, role: true },
            }),
            prisma.user.findMany({
                where: { role: 'AGENT', deletedAt: null },
                orderBy: { username: 'asc' },
                take: 250,
                select: { id: true, username: true, email: true, role: true },
            }),
            prisma.user.findMany({
                where: userOptionWhere,
                orderBy: { username: 'asc' },
                take: 300,
                select: ownershipUserSelect,
            }),
        ])

        if (exportAll && total > BALANCE_MOVEMENT_EXPORT_LIMIT) {
            return NextResponse.json({
                error: `The report has ${total} rows. Narrow the date range before exporting PDF.`,
                code: 'EXPORT_LIMIT_EXCEEDED',
                total,
                exportLimit: BALANCE_MOVEMENT_EXPORT_LIMIT,
            }, { status: 400 })
        }

        const rows = await prisma.transaction.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: exportAll ? BALANCE_MOVEMENT_EXPORT_LIMIT : filters.limit,
            select: movementRowSelect,
        })

        return NextResponse.json({
            filters: {
                page: filters.page,
                limit: filters.limit,
                range: filters.range,
                from: filters.from?.toISOString() ?? null,
                to: filters.to?.toISOString() ?? null,
                fromInput: filters.fromInput,
                toInput: filters.toInput,
                recipientRole: filters.recipientRole,
                recipientId: filters.recipientId,
                actorRole: filters.actorRole,
                actorId: filters.actorId,
                ownerType: filters.ownerType,
                ownerId: filters.ownerId,
                userSearch: filters.userSearch,
                exportAll,
            },
            summary,
            rows: rows.map(mapMovementRow),
            lookups: {
                managers,
                adminOwners,
                agents,
                users: userOptions.map(mapUserOption),
            },
            pagination: {
                page: exportAll ? 1 : filters.page,
                limit: exportAll ? total : filters.limit,
                total,
                totalPages: exportAll ? 1 : Math.max(1, Math.ceil(total / filters.limit)),
            },
            exportLimit: BALANCE_MOVEMENT_EXPORT_LIMIT,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Server error'
        if (message.includes('balance movement report date range')) {
            return NextResponse.json({ error: message }, { status: 400 })
        }

        console.error('Balance movement report error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
