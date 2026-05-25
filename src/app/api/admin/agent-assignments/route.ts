import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { getAgentTransferErrorResponse, transferUserToAgent } from '@/lib/agents/assignment-transfer'

const assignmentSchema = z.object({
    userId: z.string().min(1),
    agentId: z.string().min(1),
    sourceGroup: z.string().trim().max(120).optional().nullable(),
    whatsappGroupUrl: z.string().trim().max(500).optional().nullable(),
    replaceExisting: z.boolean().optional().default(true),
})

const endAssignmentSchema = z.object({
    assignmentId: z.string().min(1),
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
                        select: { managerId: true },
                        take: 1,
                    },
                    agentAssignmentAsUser: {
                        where: { isActive: true },
                        take: 1,
                        select: { id: true, agentId: true, sourceGroup: true, whatsappGroupUrl: true },
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
                            managerLink: { select: { managerId: true }, take: 1 },
                        },
                    },
                },
            }),
            prisma.managerUser.findMany({
                select: { userId: true },
            }),
        ])

        const managerOwnedUserIds = new Set(managerOwnedUsers.map((item) => item.userId))

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
            })),
            assignments: assignments.map((assignment) => ({
                id: assignment.id,
                sourceGroup: assignment.sourceGroup,
                whatsappGroupUrl: assignment.whatsappGroupUrl,
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

        const { userId, agentId, sourceGroup, whatsappGroupUrl, replaceExisting } = parsed.data
        const result = await transferUserToAgent({
            userId,
            agentId,
            sourceGroup,
            whatsappGroupUrl,
            replaceExisting,
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

        const existing = await prisma.agentAssignment.findUnique({
            where: { id: parsed.data.assignmentId },
            select: { id: true, isActive: true, userId: true, agentId: true },
        })

        if (!existing) {
            return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
        }

        await prisma.$transaction(async (tx) => {
            await tx.agentAssignment.update({
                where: { id: existing.id },
                data: { isActive: false, endedAt: new Date() },
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_AGENT_ASSIGNMENT_ENDED',
                    targetId: existing.id,
                    targetType: 'AgentAssignment',
                    details: { userId: existing.userId, agentId: existing.agentId },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Admin end agent assignment error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
