import { AuthenticatedUser, hasExactRole } from '@/lib/auth-utils'
import type { Prisma } from '@prisma/client'

type PendingRequestClient = Pick<Prisma.TransactionClient, 'creditRequest'>

type UserState = {
    id: string
    role?: string | null
    isActive?: boolean | null
    deletedAt?: Date | string | null
}

type AgentAssignmentState = {
    agentId: string
    userId: string
    isActive?: boolean | null
} | null | undefined

type ManagerOwnershipState = {
    managerId: string
    userId: string
} | null | undefined

export type CreditRequestEligibilityInput = {
    user: UserState
    activeAgentAssignment?: AgentAssignmentState
    activeManagerOwnership?: ManagerOwnershipState
}

export function isManagerOwnedUser(managerOwnership: ManagerOwnershipState): boolean {
    return Boolean(managerOwnership)
}

export function isActiveAgentAssignment(assignment: AgentAssignmentState): assignment is NonNullable<AgentAssignmentState> {
    return Boolean(assignment && assignment.isActive !== false)
}

export function canRequestCredit(input: CreditRequestEligibilityInput): boolean {
    if (input.user.role !== 'USER') return false
    if (input.user.isActive === false) return false
    if (input.user.deletedAt) return false
    if (isManagerOwnedUser(input.activeManagerOwnership)) return false

    return isActiveAgentAssignment(input.activeAgentAssignment)
}

export function canAdminDecide(actor: Pick<AuthenticatedUser, 'role'>): boolean {
    return hasExactRole(actor.role, 'ADMIN')
}

export function canViewAgentData(
    actor: Pick<AuthenticatedUser, 'id' | 'role'>,
    agentId: string
): boolean {
    if (hasExactRole(actor.role, 'ADMIN')) return true
    return hasExactRole(actor.role, 'AGENT') && actor.id === agentId
}

export function canViewCreditRequest(
    actor: Pick<AuthenticatedUser, 'id' | 'role'>,
    request: { userId: string; agentIdSnapshot?: string | null }
): boolean {
    if (hasExactRole(actor.role, 'ADMIN')) return true
    if (hasExactRole(actor.role, 'USER')) return actor.id === request.userId
    if (hasExactRole(actor.role, 'AGENT')) return actor.id === request.agentIdSnapshot

    return false
}

export async function findPendingCreditRequestForUser(
    client: PendingRequestClient,
    userId: string
) {
    return client.creditRequest.findFirst({
        where: {
            userId,
            status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            requestNumber: true,
            amountUsd: true,
            paymentMethod: true,
            status: true,
            createdAt: true,
        },
    })
}
