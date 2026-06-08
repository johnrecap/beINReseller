export type CurrentOwnerType = 'ADMIN' | 'MANAGER' | 'AGENT' | 'LEGACY_ADMIN' | 'UNOWNED'

export type OwnerAccountState = {
    id: string
    username?: string | null
    role?: string | null
    isActive?: boolean | null
    deletedAt?: Date | string | null
    agentProfile?: {
        displayName?: string | null
        isActive?: boolean | null
    } | null
}

export type OwnedUserState = {
    id: string
    role?: string | null
    isActive?: boolean | null
    deletedAt?: Date | string | null
    createdBy?: OwnerAccountState | null
}

export type ManagerOwnerLinkState = {
    id?: string | null
    managerId?: string | null
    manager?: OwnerAccountState | null
}

export type AgentAssignmentOwnerState = {
    id?: string | null
    agentId?: string | null
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    isActive?: boolean | null
    agent?: OwnerAccountState | null
}

export type OwnershipConflictSummary = {
    managerUserIds: string[]
    agentAssignmentIds: string[]
    hasMixedCurrentOwners: boolean
}

export type CurrentOwnerClassification = {
    userId: string
    ownerType: CurrentOwnerType
    ownerId: string | null
    ownerLabel: string | null
    agentAssignmentId: string | null
    managerUserIds: string[]
    activeAgentAssignmentIds: string[]
    isLegacyFallback: boolean
    conflicts: OwnershipConflictSummary
}

export function ownerDisplayLabel(owner: OwnerAccountState | null | undefined): string | null {
    if (!owner) return null
    const agentDisplayName = owner.agentProfile?.displayName?.trim()
    const username = owner.username?.trim()
    return agentDisplayName || username || owner.id
}

function isActiveAccount(account: OwnerAccountState | null | undefined): account is OwnerAccountState {
    return Boolean(account && account.isActive !== false && !account.deletedAt)
}

function isActiveAgentOwner(account: OwnerAccountState | null | undefined): account is OwnerAccountState {
    return Boolean(
        isActiveAccount(account)
        && account.role === 'AGENT'
        && account.agentProfile?.isActive !== false
    )
}

function currentManagerLinks(managerLinks: ManagerOwnerLinkState[] | null | undefined) {
    return (managerLinks || []).filter((link) => {
        const role = link.manager?.role
        return isActiveAccount(link.manager) && (role === 'ADMIN' || role === 'MANAGER')
    })
}

function currentAgentAssignments(activeAssignments: AgentAssignmentOwnerState[] | null | undefined) {
    return (activeAssignments || []).filter((assignment) => {
        return assignment.isActive !== false && isActiveAgentOwner(assignment.agent)
    })
}

function managerLinkId(link: ManagerOwnerLinkState): string {
    return link.id || link.managerId || link.manager?.id || ''
}

function assignmentId(assignment: AgentAssignmentOwnerState): string {
    return assignment.id || assignment.agentId || assignment.agent?.id || ''
}

export function summarizeOwnershipConflicts(input: {
    managerLinks?: ManagerOwnerLinkState[] | null
    activeAssignments?: AgentAssignmentOwnerState[] | null
}): OwnershipConflictSummary {
    const managerUserIds = currentManagerLinks(input.managerLinks)
        .map(managerLinkId)
        .filter(Boolean)
    const agentAssignmentIds = currentAgentAssignments(input.activeAssignments)
        .map(assignmentId)
        .filter(Boolean)

    return {
        managerUserIds,
        agentAssignmentIds,
        hasMixedCurrentOwners: managerUserIds.length > 0 && agentAssignmentIds.length > 0,
    }
}

export function classifyCurrentUserOwner(input: {
    user: OwnedUserState
    managerLinks?: ManagerOwnerLinkState[] | null
    activeAssignments?: AgentAssignmentOwnerState[] | null
}): CurrentOwnerClassification {
    const conflicts = summarizeOwnershipConflicts(input)
    const managerLinks = currentManagerLinks(input.managerLinks)
    const activeAssignments = currentAgentAssignments(input.activeAssignments)

    if (managerLinks.length > 0) {
        const link = managerLinks[0]
        const manager = link.manager
        const ownerType: CurrentOwnerType = manager?.role === 'ADMIN' ? 'ADMIN' : 'MANAGER'

        return {
            userId: input.user.id,
            ownerType,
            ownerId: manager?.id || link.managerId || null,
            ownerLabel: ownerDisplayLabel(manager),
            agentAssignmentId: null,
            managerUserIds: conflicts.managerUserIds,
            activeAgentAssignmentIds: conflicts.agentAssignmentIds,
            isLegacyFallback: false,
            conflicts,
        }
    }

    if (activeAssignments.length > 0) {
        const assignment = activeAssignments[0]
        const agent = assignment.agent

        return {
            userId: input.user.id,
            ownerType: 'AGENT',
            ownerId: agent?.id || assignment.agentId || null,
            ownerLabel: ownerDisplayLabel(agent),
            agentAssignmentId: assignment.id || null,
            managerUserIds: conflicts.managerUserIds,
            activeAgentAssignmentIds: conflicts.agentAssignmentIds,
            isLegacyFallback: false,
            conflicts,
        }
    }

    if (isActiveAccount(input.user.createdBy) && input.user.createdBy?.role === 'ADMIN') {
        return {
            userId: input.user.id,
            ownerType: 'LEGACY_ADMIN',
            ownerId: input.user.createdBy.id,
            ownerLabel: ownerDisplayLabel(input.user.createdBy),
            agentAssignmentId: null,
            managerUserIds: [],
            activeAgentAssignmentIds: [],
            isLegacyFallback: true,
            conflicts,
        }
    }

    return {
        userId: input.user.id,
        ownerType: 'UNOWNED',
        ownerId: null,
        ownerLabel: null,
        agentAssignmentId: null,
        managerUserIds: [],
        activeAgentAssignmentIds: [],
        isLegacyFallback: false,
        conflicts,
    }
}
