import prisma from '@/lib/prisma'
import {
    getEligibilityReasonForOwner,
} from '@/lib/credit-requests/permissions'
import type { CreditRequestEligibilityReason } from '@/lib/credit-requests/types'
import { classifyCurrentUserOwner } from '@/lib/users/ownership'

export async function getCreditRequestAccess(userId: string) {
    const [user, managerLinks, activeAgentAssignments] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
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
            },
        }),
        prisma.managerUser.findMany({
            where: { userId },
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
        }),
        prisma.agentAssignment.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                agentId: true,
                userId: true,
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
        }),
    ])

    const owner = user
        ? classifyCurrentUserOwner({
            user,
            managerLinks,
            activeAssignments: activeAgentAssignments,
        })
        : null
    const activeAgentAssignment = owner?.ownerType === 'AGENT'
        ? activeAgentAssignments.find((assignment) => assignment.id === owner.agentAssignmentId) || null
        : null
    const eligibilityReason: CreditRequestEligibilityReason = user && owner
        ? getEligibilityReasonForOwner({ user, owner })
        : 'UNAUTHENTICATED'
    const agentProfile = activeAgentAssignment?.agent.agentProfile
    const agentName = activeAgentAssignment
        ? agentProfile?.displayName || activeAgentAssignment.agent.username
        : null

    return {
        user,
        managerLinks,
        activeAgentAssignments,
        activeAgentAssignment,
        owner,
        eligibilityReason,
        canRequest: eligibilityReason === 'ELIGIBLE',
        agentName,
        sourceGroup: activeAgentAssignment?.sourceGroup || null,
    }
}
