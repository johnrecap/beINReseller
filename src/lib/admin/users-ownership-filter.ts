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

export function buildAgentOwnedUserFilter(agentId: string): Prisma.UserWhereInput {
    return {
        agentAssignmentAsUser: {
            some: {
                agentId,
                isActive: true,
            },
        },
    }
}

export function resolveAdminUsersOwnerFilter(input: {
    managerId: string
    agentId: string
}) {
    if (input.managerId && input.agentId) {
        return { ok: false as const, error: 'INVALID_OWNER_FILTER' as const }
    }

    if (input.agentId) {
        return { ok: true as const, where: buildAgentOwnedUserFilter(input.agentId) }
    }

    if (input.managerId) {
        return { ok: true as const, where: buildManagerOwnedUserFilter(input.managerId) }
    }

    return { ok: true as const, where: {} satisfies Prisma.UserWhereInput }
}
