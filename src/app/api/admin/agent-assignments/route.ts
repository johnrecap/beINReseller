import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { getAgentTransferErrorResponse, transferUserToAgent } from '@/lib/agents/assignment-transfer'
import { buildOwnershipToken } from '../../../../../shared/db/ownership-evidence-lock'
import { endAgentAssignment } from '@/lib/users/ownership-transfer'

const assignmentSchema = z.object({
    userId: z.string().min(1),
    agentId: z.string().min(1),
    sourceGroup: z.string().trim().max(120).optional().nullable(),
    whatsappGroupUrl: z.string().trim().max(500).optional().nullable(),
    replaceExisting: z.boolean().optional().default(true),
    expectedOwnershipToken: z.string().trim().min(1).optional(),
})

const endAssignmentSchema = z.object({
    assignmentId: z.string().min(1),
    expectedOwnershipToken: z.string().trim().min(1).optional(),
})

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const [agents, users, assignments, managerOwnedUsers] = await Promise.all([
            prisma.user.findMany({
                where: { role: 'AGENT', deletedAt: null },
                orderBy: { username: 'asc' },
                select: {
                    id: true,
                    username: true,
                    isActive: true,
                    agentProfile: {
                        select: {
                            displayName: true,
                            whapiGroupId: true,
                            whapiGroupName: true,
                            whatsappHandoffGroupUrl: true,
                            whatsappHandoffPhone: true,
                            whatsappHandoffLabel: true,
                            whatsappNotificationsEnabled: true,
                            defaultSourceGroup: true,
                            isActive: true,
                        },
                    },
                },
            }),
            prisma.user.findMany({
                where: { role: 'USER', deletedAt: null },
                orderBy: { username: 'asc' },
                select: {
                    id: true,
                    username: true,
                    balance: true,
                    isActive: true,
                    managerLink: {
                        select: { id: true, managerId: true },
                    },
                    agentAssignmentAsUser: {
                        where: { isActive: true },
                        select: {
                            id: true,
                            agentId: true,
                            sourceGroup: true,
                            whatsappGroupUrl: true,
                            updatedAt: true,
                        },
                    },
                },
            }),
            prisma.agentAssignment.findMany({
                where: { isActive: true },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    sourceGroup: true,
                    whatsappGroupUrl: true,
                    createdAt: true,
                    agent: {
                        select: {
                            id: true,
                            username: true,
                            agentProfile: { select: { displayName: true } },
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            username: true,
                            balance: true,
                            isActive: true,
                            managerLink: { select: { id: true, managerId: true } },
                            agentAssignmentAsUser: {
                                where: { isActive: true },
                                select: {
                                    id: true,
                                    agentId: true,
                                    sourceGroup: true,
                                    whatsappGroupUrl: true,
                                    updatedAt: true,
                                },
                            },
                        },
                    },
                },
            }),
            prisma.managerUser.findMany({
                select: { userId: true },
            }),
        ])

        const managerOwnedUserIds = new Set(managerOwnedUsers.map((item) => item.userId))
        const ownershipTokensByUserId = new Map(users.map((user) => [
            user.id,
            buildOwnershipToken({
                managerLinks: user.managerLink,
                activeAssignments: user.agentAssignmentAsUser,
            }),
        ]))

        return NextResponse.json({
            agents: agents.map((agent) => ({
                id: agent.id,
                username: agent.username,
                isActive: agent.isActive,
                profile: {
                    displayName: agent.agentProfile?.displayName || '',
                    whapiGroupId: agent.agentProfile?.whapiGroupId || '',
                    whapiGroupName: agent.agentProfile?.whapiGroupName || '',
                    whatsappHandoffGroupUrl: agent.agentProfile?.whatsappHandoffGroupUrl || '',
                    whatsappHandoffPhone: agent.agentProfile?.whatsappHandoffPhone || '',
                    whatsappHandoffLabel: agent.agentProfile?.whatsappHandoffLabel || '',
                    whatsappNotificationsEnabled: agent.agentProfile?.whatsappNotificationsEnabled ?? false,
                    defaultSourceGroup: agent.agentProfile?.defaultSourceGroup || '',
                    isActive: agent.agentProfile?.isActive ?? agent.isActive,
                },
            })),
            users: users.map((user) => ({
                id: user.id,
                username: user.username,
                balance: user.balance,
                isActive: user.isActive,
                managerOwned: user.managerLink.length > 0,
                activeAssignment: user.agentAssignmentAsUser[0] || null,
                ownershipToken: ownershipTokensByUserId.get(user.id),
            })),
            assignments: assignments.map((assignment) => ({
                id: assignment.id,
                sourceGroup: assignment.sourceGroup,
                whatsappGroupUrl: assignment.whatsappGroupUrl,
                ownershipToken: ownershipTokensByUserId.get(assignment.user.id),
                createdAt: assignment.createdAt.toISOString(),
                agent: {
                    id: assignment.agent.id,
                    username: assignment.agent.username,
                    displayName: assignment.agent.agentProfile?.displayName || assignment.agent.username,
                },
                user: {
                    id: assignment.user.id,
                    username: assignment.user.username,
                    balance: assignment.user.balance,
                    isActive: assignment.user.isActive,
                    managerOwned: managerOwnedUserIds.has(assignment.user.id),
                },
            })),
        })
    } catch (error) {
        console.error('Admin agent assignments list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = assignmentSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid assignment data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }
        if (!parsed.data.expectedOwnershipToken) {
            return NextResponse.json(
                { error: 'OWNERSHIP_PRECONDITION_REQUIRED', reason: 'OWNERSHIP_PRECONDITION_REQUIRED' },
                { status: 428 }
            )
        }

        const {
            userId,
            agentId,
            sourceGroup,
            whatsappGroupUrl,
            replaceExisting,
            expectedOwnershipToken,
        } = parsed.data
        const result = await transferUserToAgent({
            userId,
            agentId,
            ...(Object.prototype.hasOwnProperty.call(parsed.data, 'sourceGroup')
                ? { sourceGroup }
                : {}),
            ...(Object.prototype.hasOwnProperty.call(parsed.data, 'whatsappGroupUrl')
                ? { whatsappGroupUrl }
                : {}),
            replaceExisting,
            expectedOwnershipToken,
            adminUserId: authResult.user.id,
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        })

        return NextResponse.json({
            success: true,
            assignment: result.assignment,
            transfer: result.transfer,
        })
    } catch (error) {
        const transferError = getAgentTransferErrorResponse(error)
        if (transferError) {
            return NextResponse.json({
                error: transferError.code,
                reason: transferError.code,
                currentOwnershipToken: transferError.currentOwnershipToken,
                currentOwnershipSummary: transferError.currentOwnershipSummary,
            }, { status: transferError.status })
        }
        console.error('Admin create agent assignment error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = endAssignmentSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid assignment data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }
        if (!parsed.data.expectedOwnershipToken) {
            return NextResponse.json(
                { error: 'OWNERSHIP_PRECONDITION_REQUIRED' },
                { status: 428 }
            )
        }

        const result = await endAgentAssignment({
            assignmentId: parsed.data.assignmentId,
            expectedOwnershipToken: parsed.data.expectedOwnershipToken,
            adminUserId: authResult.user.id,
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent'),
        })

        return NextResponse.json({ success: true, result })
    } catch (error) {
        const transferError = getAgentTransferErrorResponse(error)
        if (transferError) {
            return NextResponse.json({
                error: transferError.code,
                currentOwnershipToken: transferError.currentOwnershipToken,
                currentOwnershipSummary: transferError.currentOwnershipSummary,
            }, { status: transferError.status })
        }
        console.error('Admin end agent assignment error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
