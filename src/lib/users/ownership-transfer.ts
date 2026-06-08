import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

export type OwnershipTransferTargetType = 'ADMIN' | 'MANAGER' | 'AGENT'

type UserTransferState = {
    id: string
    role?: string | null
    isActive?: boolean | null
    deletedAt?: Date | string | null
}

type TargetOwnerTransferState = UserTransferState & {
    username?: string | null
    agentProfile?: {
        defaultSourceGroup?: string | null
        isActive?: boolean | null
    } | null
}

type ValidationFailureCode = 'INVALID_TARGET_USER' | 'INVALID_TARGET_OWNER' | 'SOURCE_GROUP_REQUIRED'

export type OwnershipTransferValidationResult =
    | { ok: true }
    | { ok: false; code: ValidationFailureCode; status: 400 }

export type OwnershipTransferPlan = {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    managerUserIdsToRemove: string[]
    activeAssignmentIdsToClose: string[]
    requiresAgentAssignmentCreate: boolean
    requiresManagerLinkCreate: boolean
    replacedOwnership: boolean
}

export type OwnershipTransferResult = {
    userId: string
    newOwnerType: OwnershipTransferTargetType
    newOwnerId: string
    newOwnerLabel: string
    managerUserIdsRemoved: string[]
    activeAssignmentIdsClosed: string[]
    managerLinkId: string | null
    agentAssignment: {
        id: string
        sourceGroup: string
        whatsappGroupUrl: string | null
    } | null
}

type TransferDbClient = Pick<
    Prisma.TransactionClient,
    'user' | 'managerUser' | 'agentAssignment' | 'activityLog'
>

function unique(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter(Boolean) as string[]))
}

function isActiveAccount(account: UserTransferState | null | undefined): account is UserTransferState {
    return Boolean(account && account.isActive !== false && !account.deletedAt)
}

function clean(value: string | null | undefined): string | null {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

function ownerLabel(owner: TargetOwnerTransferState): string {
    return owner.username?.trim() || owner.id
}

export function validateOwnershipTransferTargets(input: {
    user: UserTransferState | null | undefined
    targetOwner: TargetOwnerTransferState | null | undefined
    targetOwnerType: OwnershipTransferTargetType
}): OwnershipTransferValidationResult {
    if (!isActiveAccount(input.user) || input.user.role !== 'USER') {
        return { ok: false, code: 'INVALID_TARGET_USER', status: 400 }
    }

    if (!isActiveAccount(input.targetOwner) || input.targetOwner.role !== input.targetOwnerType) {
        return { ok: false, code: 'INVALID_TARGET_OWNER', status: 400 }
    }

    if (
        input.targetOwnerType === 'AGENT'
        && input.targetOwner.agentProfile?.isActive === false
    ) {
        return { ok: false, code: 'INVALID_TARGET_OWNER', status: 400 }
    }

    return { ok: true }
}

export function buildOwnershipTransferPlan(input: {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    managerUserIds?: string[]
    activeAssignments?: Array<{ id?: string | null; agentId?: string | null }>
}): OwnershipTransferPlan {
    const managerUserIdsToRemove = unique(input.managerUserIds || [])
    const activeAssignmentIdsToClose = unique((input.activeAssignments || []).map((assignment) => assignment.id))

    return {
        userId: input.userId,
        targetOwnerType: input.targetOwnerType,
        targetOwnerId: input.targetOwnerId,
        managerUserIdsToRemove,
        activeAssignmentIdsToClose,
        requiresAgentAssignmentCreate: input.targetOwnerType === 'AGENT',
        requiresManagerLinkCreate: input.targetOwnerType === 'ADMIN' || input.targetOwnerType === 'MANAGER',
        replacedOwnership: managerUserIdsToRemove.length > 0 || activeAssignmentIdsToClose.length > 0,
    }
}

export function getOwnershipTransferErrorResponse(error: unknown): OwnershipTransferValidationResult | null {
    if (
        error
        && typeof error === 'object'
        && 'ok' in error
        && 'code' in error
        && 'status' in error
    ) {
        return error as OwnershipTransferValidationResult
    }

    return null
}

export async function transferUserOwnershipInTransaction(input: {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    adminUserId: string
    reason?: string | null
    ipAddress?: string | null
    userAgent?: string | null
}, db: TransferDbClient): Promise<OwnershipTransferResult> {
    const [user, targetOwner, managerLinks, activeAssignments] = await Promise.all([
        db.user.findUnique({
            where: { id: input.userId },
            select: { id: true, role: true, isActive: true, deletedAt: true },
        }),
        db.user.findUnique({
            where: { id: input.targetOwnerId },
            select: {
                id: true,
                username: true,
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
            select: { id: true, managerId: true },
        }),
        db.agentAssignment.findMany({
            where: { userId: input.userId, isActive: true },
            select: { id: true, agentId: true },
            orderBy: { createdAt: 'asc' },
        }),
    ])

    const validation = validateOwnershipTransferTargets({
        user,
        targetOwner,
        targetOwnerType: input.targetOwnerType,
    })
    if (!validation.ok) {
        throw Object.assign(new Error(validation.code), validation)
    }

    const target = targetOwner as TargetOwnerTransferState
    const transferPlan = buildOwnershipTransferPlan({
        userId: input.userId,
        targetOwnerType: input.targetOwnerType,
        targetOwnerId: input.targetOwnerId,
        managerUserIds: managerLinks.map((link) => link.id),
        activeAssignments,
    })

    const sourceGroup = input.targetOwnerType === 'AGENT'
        ? clean(input.sourceGroup) || clean(target.agentProfile?.defaultSourceGroup)
        : null

    if (input.targetOwnerType === 'AGENT' && !sourceGroup) {
        const failure = { ok: false, code: 'SOURCE_GROUP_REQUIRED', status: 400 } as const
        throw Object.assign(new Error(failure.code), failure)
    }

    const now = new Date()
    await db.agentAssignment.updateMany({
        where: { userId: input.userId, isActive: true },
        data: { isActive: false, endedAt: now },
    })

    await db.managerUser.deleteMany({
        where: { userId: input.userId },
    })

    let managerLinkId: string | null = null
    let agentAssignment: OwnershipTransferResult['agentAssignment'] = null
    const whatsappGroupUrl = clean(input.whatsappGroupUrl)

    if (input.targetOwnerType === 'AGENT') {
        const created = await db.agentAssignment.create({
            data: {
                userId: input.userId,
                agentId: input.targetOwnerId,
                sourceGroup: sourceGroup as string,
                whatsappGroupUrl,
                assignedByAdminId: input.adminUserId,
            },
            select: {
                id: true,
                sourceGroup: true,
                whatsappGroupUrl: true,
            },
        })
        agentAssignment = created
    } else {
        const created = await db.managerUser.create({
            data: {
                userId: input.userId,
                managerId: input.targetOwnerId,
            },
            select: { id: true },
        })
        managerLinkId = created.id
    }

    await db.activityLog.create({
        data: {
            userId: input.adminUserId,
            action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
            targetId: input.userId,
            targetType: 'User',
            details: {
                userId: input.userId,
                targetOwnerType: input.targetOwnerType,
                targetOwnerId: input.targetOwnerId,
                targetOwnerLabel: ownerLabel(target),
                managerUserIdsRemoved: transferPlan.managerUserIdsToRemove,
                activeAssignmentIdsClosed: transferPlan.activeAssignmentIdsToClose,
                managerLinkId,
                agentAssignmentId: agentAssignment?.id || null,
                sourceGroup,
                whatsappGroupUrl,
                reason: clean(input.reason),
                replacedOwnership: transferPlan.replacedOwnership,
            },
            ipAddress: input.ipAddress || 'unknown',
            userAgent: input.userAgent || null,
        },
    })

    return {
        userId: input.userId,
        newOwnerType: input.targetOwnerType,
        newOwnerId: input.targetOwnerId,
        newOwnerLabel: ownerLabel(target),
        managerUserIdsRemoved: transferPlan.managerUserIdsToRemove,
        activeAssignmentIdsClosed: transferPlan.activeAssignmentIdsToClose,
        managerLinkId,
        agentAssignment,
    }
}

export async function transferUserOwnership(input: {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    adminUserId: string
    reason?: string | null
    ipAddress?: string | null
    userAgent?: string | null
}): Promise<OwnershipTransferResult> {
    return prisma.$transaction((tx) => transferUserOwnershipInTransaction(input, tx))
}
