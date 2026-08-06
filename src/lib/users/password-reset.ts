import { hash } from 'bcryptjs'
import prisma from '@/lib/prisma'
import { SECURITY_CONFIG } from '@/lib/config'
import type { Role } from '@/lib/permissions'
import {
    lockOwnershipOwnerRows,
    lockOwnershipSubjectRow,
} from '../../../shared/db/ownership-evidence-lock'

export type PasswordResetErrorCode =
    | 'INVALID_PASSWORD'
    | 'PERMISSION_DENIED'
    | 'PASSWORD_RESET_NOT_ALLOWED'
    | 'TARGET_USER_NOT_FOUND'
    | 'OWNERSHIP_CONFLICT'
    | 'RATE_LIMITED'

type PasswordResetOwnershipKind = 'ADMIN' | 'MANAGER' | 'AGENT'

type PasswordResetAccount = {
    id: string
    role: Role | string
    isActive: boolean
    deletedAt: Date | string | null
}

export type PasswordResetAuthorizationInput = {
    actor: PasswordResetAccount | null
    target: PasswordResetAccount | null
    managerIds: string[]
    activeAgentIds: string[]
}

export type PasswordResetAuthorizationDecision =
    | { allowed: true; ownershipKind: PasswordResetOwnershipKind }
    | { allowed: false; code: PasswordResetErrorCode }

export class PasswordResetError extends Error {
    constructor(
        public readonly code: PasswordResetErrorCode,
        public readonly status: number
    ) {
        super(code)
        this.name = 'PasswordResetError'
    }
}

export function decidePasswordResetAuthorization(
    input: PasswordResetAuthorizationInput
): PasswordResetAuthorizationDecision {
    const { actor, target, managerIds, activeAgentIds } = input

    if (!actor || !actor.isActive || actor.deletedAt) {
        return { allowed: false, code: 'PERMISSION_DENIED' }
    }

    if (!target || !target.isActive || target.deletedAt) {
        return { allowed: false, code: 'TARGET_USER_NOT_FOUND' }
    }

    if (actor.id === target.id || actor.role === 'USER') {
        return { allowed: false, code: 'PASSWORD_RESET_NOT_ALLOWED' }
    }

    if (actor.role === 'ADMIN') {
        return target.role === 'MANAGER' || target.role === 'AGENT' || target.role === 'USER'
            ? { allowed: true, ownershipKind: 'ADMIN' }
            : { allowed: false, code: 'PASSWORD_RESET_NOT_ALLOWED' }
    }

    if (target.role !== 'USER') {
        return { allowed: false, code: 'PASSWORD_RESET_NOT_ALLOWED' }
    }

    if (actor.role === 'MANAGER') {
        const ownsTarget = (
            managerIds.length === 1
            && managerIds[0] === actor.id
            && activeAgentIds.length === 0
        )
        return ownsTarget
            ? { allowed: true, ownershipKind: 'MANAGER' }
            : { allowed: false, code: 'OWNERSHIP_CONFLICT' }
    }

    if (actor.role === 'AGENT') {
        const ownsTarget = (
            activeAgentIds.length === 1
            && activeAgentIds[0] === actor.id
            && managerIds.length === 0
        )
        return ownsTarget
            ? { allowed: true, ownershipKind: 'AGENT' }
            : { allowed: false, code: 'OWNERSHIP_CONFLICT' }
    }

    return { allowed: false, code: 'PASSWORD_RESET_NOT_ALLOWED' }
}

function errorStatus(code: PasswordResetErrorCode): number {
    if (code === 'INVALID_PASSWORD') return 400
    if (code === 'TARGET_USER_NOT_FOUND') return 404
    if (code === 'OWNERSHIP_CONFLICT') return 409
    if (code === 'RATE_LIMITED') return 429
    return 403
}

function auditAction(role: PasswordResetOwnershipKind): string {
    if (role === 'ADMIN') return 'ADMIN_RESET_PASSWORD'
    if (role === 'MANAGER') return 'MANAGER_RESET_PASSWORD'
    return 'AGENT_RESET_PASSWORD'
}

export async function resetUserPassword(input: {
    actorId: string
    actorRole: PasswordResetOwnershipKind
    targetUserId: string
    newPassword: string
    ipAddress?: string | null
    userAgent?: string | null
}) {
    if (input.newPassword.length < 6) {
        throw new PasswordResetError('INVALID_PASSWORD', 400)
    }

    return prisma.$transaction(async (tx) => {
        const targetLocked = await lockOwnershipSubjectRow(tx, input.targetUserId)
        if (!targetLocked) {
            throw new PasswordResetError('TARGET_USER_NOT_FOUND', 404)
        }

        const [initialManagerLinks, initialAssignments] = await Promise.all([
            tx.managerUser.findMany({
                where: { userId: input.targetUserId },
                select: { managerId: true },
            }),
            tx.agentAssignment.findMany({
                where: { userId: input.targetUserId, isActive: true },
                select: { agentId: true },
            }),
        ])

        await lockOwnershipOwnerRows(tx, {
            subjectUserId: input.targetUserId,
            ownerUserIds: [
                input.actorId,
                ...initialManagerLinks.map((link) => link.managerId),
                ...initialAssignments.map((assignment) => assignment.agentId),
            ],
        })

        const [actor, target, managerLinks, activeAssignments] = await Promise.all([
            tx.user.findUnique({
                where: { id: input.actorId },
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                },
            }),
            tx.user.findUnique({
                where: { id: input.targetUserId },
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                },
            }),
            tx.managerUser.findMany({
                where: { userId: input.targetUserId },
                select: { managerId: true },
                orderBy: { id: 'asc' },
            }),
            tx.agentAssignment.findMany({
                where: { userId: input.targetUserId, isActive: true },
                select: { agentId: true },
                orderBy: { id: 'asc' },
            }),
        ])

        if (actor?.role !== input.actorRole) {
            throw new PasswordResetError('PERMISSION_DENIED', 403)
        }

        const decision = decidePasswordResetAuthorization({
            actor,
            target,
            managerIds: managerLinks.map((link) => link.managerId),
            activeAgentIds: activeAssignments.map((assignment) => assignment.agentId),
        })

        if (!decision.allowed) {
            throw new PasswordResetError(decision.code, errorStatus(decision.code))
        }

        const passwordHash = await hash(input.newPassword, SECURITY_CONFIG.bcryptRounds)
        const passwordChangedAt = new Date()

        await tx.user.update({
            where: { id: input.targetUserId },
            data: {
                passwordHash,
                passwordChangedAt,
            },
        })

        await tx.activityLog.create({
            data: {
                userId: input.actorId,
                action: auditAction(decision.ownershipKind),
                targetId: input.targetUserId,
                targetType: 'User',
                details: {
                    actorRole: input.actorRole,
                    targetRole: target!.role,
                    ownershipKind: decision.ownershipKind,
                },
                ipAddress: input.ipAddress || 'unknown',
                userAgent: input.userAgent || null,
            },
        })

        return {
            success: true as const,
            code: 'PASSWORD_RESET_SUCCESS' as const,
            passwordChangedAt,
        }
    })
}
