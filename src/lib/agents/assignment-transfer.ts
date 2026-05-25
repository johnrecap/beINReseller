import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

export type AgentTransferErrorCode =
    | 'INVALID_TARGET_USER'
    | 'INVALID_TARGET_AGENT'
    | 'SOURCE_GROUP_REQUIRED'
    | 'OWNERSHIP_EXISTS'

export type AgentTransferError = {
    ok: false
    code: AgentTransferErrorCode
    status: 400 | 409
}

export type TransferUserAccount = {
    id: string
    role: string
    isActive: boolean
    deletedAt: Date | string | null
}

export type TransferAgentAccount = {
    id: string
    role: string
    isActive: boolean
    deletedAt: Date | string | null
    agentProfile?: {
        defaultSourceGroup: string | null
        isActive: boolean
    } | null
}

export type ActiveAgentAssignment = {
    id: string
    agentId: string
    sourceGroup: string
}

export type AgentTransferPlan = {
    mode: 'created' | 'transferred' | 'refreshed'
    userId: string
    agentId: string
    sourceGroup: string
    previousManagerOwnerIds: string[]
    previousAgentAssignmentIds: string[]
    replacedOwnership: boolean
}

export type AgentTransferResult = {
    assignment: {
        id: string
        userId: string
        agentId: string
        sourceGroup: string
        createdAt: string
    }
    transfer: AgentTransferPlan
}

type TransferDbClient = Pick<
    Prisma.TransactionClient,
    'user' | 'managerUser' | 'agentAssignment' | 'activityLog'
>

function cleanSourceGroup(value: string | null | undefined) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

export function validateAgentTransferTargets(input: {
    user: TransferUserAccount | null
    agent: TransferAgentAccount | null
}): { ok: true } | AgentTransferError {
    if (!input.user || input.user.role !== 'USER' || !input.user.isActive || input.user.deletedAt) {
        return { ok: false, code: 'INVALID_TARGET_USER', status: 400 }
    }

    if (
        !input.agent ||
        input.agent.role !== 'AGENT' ||
        !input.agent.isActive ||
        input.agent.deletedAt ||
        input.agent.agentProfile?.isActive === false
    ) {
        return { ok: false, code: 'INVALID_TARGET_AGENT', status: 400 }
    }

    return { ok: true }
}

export function resolveAgentSourceGroup(input: {
    requestedSourceGroup?: string | null
    agentDefaultSourceGroup?: string | null
}): { ok: true; sourceGroup: string } | AgentTransferError {
    const explicit = cleanSourceGroup(input.requestedSourceGroup)
    if (explicit) return { ok: true, sourceGroup: explicit }

    const fallback = cleanSourceGroup(input.agentDefaultSourceGroup)
    if (fallback) return { ok: true, sourceGroup: fallback }

    return { ok: false, code: 'SOURCE_GROUP_REQUIRED', status: 400 }
}

export function buildAgentTransferPlan(input: {
    userId: string
    targetAgentId: string
    sourceGroup: string
    managerOwnerIds: string[]
    activeAssignments: ActiveAgentAssignment[]
    replaceExisting: boolean
}): AgentTransferPlan | AgentTransferError {
    const previousManagerOwnerIds = [...new Set(input.managerOwnerIds)]
    const previousAgentAssignmentIds = input.activeAssignments.map((assignment) => assignment.id)
    const hasExistingOwnership = previousManagerOwnerIds.length > 0 || previousAgentAssignmentIds.length > 0

    if (hasExistingOwnership && !input.replaceExisting) {
        return { ok: false, code: 'OWNERSHIP_EXISTS', status: 409 }
    }

    const sameAgentOnly = input.activeAssignments.length > 0
        && input.activeAssignments.every((assignment) => assignment.agentId === input.targetAgentId)
        && previousManagerOwnerIds.length === 0

    return {
        mode: !hasExistingOwnership ? 'created' : sameAgentOnly ? 'refreshed' : 'transferred',
        userId: input.userId,
        agentId: input.targetAgentId,
        sourceGroup: input.sourceGroup,
        previousManagerOwnerIds,
        previousAgentAssignmentIds,
        replacedOwnership: hasExistingOwnership,
    }
}

export async function transferUserToAgentInTransaction(input: {
    userId: string
    agentId: string
    sourceGroup?: string | null
    replaceExisting?: boolean
    adminUserId: string
    ipAddress?: string | null
}, db: TransferDbClient): Promise<AgentTransferResult> {
    const [user, agent, managerLinks, activeAssignments] = await Promise.all([
        db.user.findUnique({
            where: { id: input.userId },
            select: { id: true, role: true, isActive: true, deletedAt: true },
        }),
        db.user.findUnique({
            where: { id: input.agentId },
            select: {
                id: true,
                role: true,
                isActive: true,
                deletedAt: true,
                agentProfile: {
                    select: {
                        defaultSourceGroup: true,
                        isActive: true,
                    },
                },
            },
        }),
        db.managerUser.findMany({
            where: { userId: input.userId },
            select: { managerId: true },
        }),
        db.agentAssignment.findMany({
            where: { userId: input.userId, isActive: true },
            select: { id: true, agentId: true, sourceGroup: true },
            orderBy: { createdAt: 'asc' },
        }),
    ])

    const targetValidation = validateAgentTransferTargets({ user, agent })
    if (!targetValidation.ok) {
        throw Object.assign(new Error(targetValidation.code), targetValidation)
    }
    const validAgent = agent as TransferAgentAccount

    const sourceGroup = resolveAgentSourceGroup({
        requestedSourceGroup: input.sourceGroup,
        agentDefaultSourceGroup: validAgent.agentProfile?.defaultSourceGroup ?? null,
    })
    if (!sourceGroup.ok) {
        throw Object.assign(new Error(sourceGroup.code), sourceGroup)
    }

    const transfer = buildAgentTransferPlan({
        userId: input.userId,
        targetAgentId: input.agentId,
        sourceGroup: sourceGroup.sourceGroup,
        managerOwnerIds: managerLinks.map((link) => link.managerId),
        activeAssignments,
        replaceExisting: input.replaceExisting ?? true,
    })
    if ('ok' in transfer && !transfer.ok) {
        throw Object.assign(new Error(transfer.code), transfer)
    }
    const transferPlan = transfer as AgentTransferPlan

    const now = new Date()

    await db.agentAssignment.updateMany({
        where: { userId: input.userId, isActive: true },
        data: { isActive: false, endedAt: now },
    })

    await db.managerUser.deleteMany({
        where: { userId: input.userId },
    })

    const assignment = await db.agentAssignment.create({
        data: {
            userId: input.userId,
            agentId: input.agentId,
            sourceGroup: sourceGroup.sourceGroup,
            assignedByAdminId: input.adminUserId,
        },
        select: {
            id: true,
            userId: true,
            agentId: true,
            sourceGroup: true,
            createdAt: true,
        },
    })

    await db.activityLog.create({
        data: {
            userId: input.adminUserId,
            action: 'ADMIN_AGENT_ASSIGNMENT_TRANSFERRED',
            targetId: assignment.id,
            targetType: 'AgentAssignment',
            details: {
                userId: input.userId,
                agentId: input.agentId,
                sourceGroup: sourceGroup.sourceGroup,
                mode: transferPlan.mode,
                previousManagerOwnerIds: transferPlan.previousManagerOwnerIds,
                previousAgentAssignmentIds: transferPlan.previousAgentAssignmentIds,
                replacedOwnership: transferPlan.replacedOwnership,
            },
            ipAddress: input.ipAddress || 'unknown',
        },
    })

    return {
        assignment: {
            id: assignment.id,
            userId: assignment.userId,
            agentId: assignment.agentId,
            sourceGroup: assignment.sourceGroup,
            createdAt: assignment.createdAt.toISOString(),
        },
        transfer: transferPlan,
    }
}

export async function transferUserToAgent(input: {
    userId: string
    agentId: string
    sourceGroup?: string | null
    replaceExisting?: boolean
    adminUserId: string
    ipAddress?: string | null
}): Promise<AgentTransferResult> {
    return prisma.$transaction((tx) => transferUserToAgentInTransaction(input, tx))
}

export function getAgentTransferErrorResponse(error: unknown): AgentTransferError | null {
    if (
        error &&
        typeof error === 'object' &&
        'ok' in error &&
        'code' in error &&
        'status' in error
    ) {
        return error as AgentTransferError
    }

    return null
}
