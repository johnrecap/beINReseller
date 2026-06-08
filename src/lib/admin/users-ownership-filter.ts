import type { Prisma } from '@prisma/client'

export function buildManagerOwnedUserFilter(managerId: string): Prisma.UserWhereInput {
    return {
        OR: [
            { managerLink: { some: { managerId } } },
            {
                createdById: managerId,
                managerLink: { none: {} },
                agentAssignmentAsUser: { none: { isActive: true } },
            },
        ],
    }
}
