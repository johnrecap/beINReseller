import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

type OwnershipAuditDbClient = Pick<Prisma.TransactionClient, 'managerUser' | 'agentAssignment' | 'user'>

export type OwnershipAuditSummary = {
    duplicateManagerLinkUsers: number
    duplicateActiveAgentUsers: number
    mixedOwnershipUsers: number
    legacyAdminFallbackUsers: number
    sampleUserIds: string[]
}

function unique(values: string[]) {
    return Array.from(new Set(values))
}

export async function auditUserOwnership(
    db: OwnershipAuditDbClient = prisma,
    sampleLimit = 25
): Promise<OwnershipAuditSummary> {
    const [managerGroups, activeAgentGroups, legacyAdminUsers] = await Promise.all([
        db.managerUser.groupBy({
            by: ['userId'],
            _count: { _all: true },
            having: { userId: { _count: { gt: 1 } } },
        }),
        db.agentAssignment.groupBy({
            by: ['userId'],
            where: { isActive: true },
            _count: { _all: true },
            having: { userId: { _count: { gt: 1 } } },
        }),
        db.user.findMany({
            where: {
                role: 'USER',
                deletedAt: null,
                createdBy: { role: 'ADMIN', isActive: true, deletedAt: null },
                managerLink: { none: {} },
                agentAssignmentAsUser: { none: { isActive: true } },
            },
            select: { id: true },
            take: sampleLimit,
        }),
    ])

    const duplicateManagerUserIds = managerGroups.map((group) => group.userId)
    const duplicateAgentUserIds = activeAgentGroups.map((group) => group.userId)
    const mixedUsers = await db.user.findMany({
        where: {
            id: { in: unique([...duplicateManagerUserIds, ...duplicateAgentUserIds]) },
            managerLink: { some: {} },
            agentAssignmentAsUser: { some: { isActive: true } },
        },
        select: { id: true },
        take: sampleLimit,
    })

    return {
        duplicateManagerLinkUsers: duplicateManagerUserIds.length,
        duplicateActiveAgentUsers: duplicateAgentUserIds.length,
        mixedOwnershipUsers: mixedUsers.length,
        legacyAdminFallbackUsers: legacyAdminUsers.length,
        sampleUserIds: unique([
            ...duplicateManagerUserIds,
            ...duplicateAgentUserIds,
            ...mixedUsers.map((user) => user.id),
            ...legacyAdminUsers.map((user) => user.id),
        ]).slice(0, sampleLimit),
    }
}
