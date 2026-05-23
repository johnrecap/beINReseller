import { NextRequest, NextResponse } from 'next/server'
import { PointRuleOwnerType } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'

const rateSchema = z.number().min(0).max(100000)

const settingsSchema = z.object({
    userGlobalPointsPerThousand: rateSchema,
    agentDefaultPointsPerThousand: rateSchema,
    managerDefaultPointsPerThousand: rateSchema,
    agentOverrides: z.array(z.object({
        agentId: z.string().min(1),
        pointsPerThousand: rateSchema,
    })).optional().default([]),
    managerOverrides: z.array(z.object({
        managerId: z.string().min(1),
        pointsPerThousand: rateSchema,
    })).optional().default([]),
})

type RuleKey = `${PointRuleOwnerType}:${string}`

function makeRuleKey(ownerType: PointRuleOwnerType, ownerUserId: string | null): RuleKey {
    return `${ownerType}:${ownerUserId || 'GLOBAL'}`
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const [rules, agents, managers] = await Promise.all([
            prisma.pointRule.findMany({
                where: { isActive: true },
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    ownerType: true,
                    ownerUserId: true,
                    pointsPerThousand: true,
                    updatedAt: true,
                },
            }),
            prisma.user.findMany({
                where: { role: 'AGENT', deletedAt: null },
                orderBy: { username: 'asc' },
                select: {
                    id: true,
                    username: true,
                    isActive: true,
                    agentProfile: { select: { displayName: true } },
                },
            }),
            prisma.user.findMany({
                where: { role: 'MANAGER', deletedAt: null },
                orderBy: { username: 'asc' },
                select: { id: true, username: true, isActive: true },
            }),
        ])

        const ruleMap = new Map<RuleKey, (typeof rules)[number]>()
        for (const rule of rules) {
            const key = makeRuleKey(rule.ownerType, rule.ownerUserId)
            if (!ruleMap.has(key)) {
                ruleMap.set(key, rule)
            }
        }

        return NextResponse.json({
            defaults: {
                userGlobalPointsPerThousand: ruleMap.get(makeRuleKey('USER_GLOBAL', null))?.pointsPerThousand ?? 0,
                agentDefaultPointsPerThousand: ruleMap.get(makeRuleKey('AGENT_DEFAULT', null))?.pointsPerThousand ?? 0,
                managerDefaultPointsPerThousand: ruleMap.get(makeRuleKey('MANAGER_DEFAULT', null))?.pointsPerThousand ?? 0,
            },
            agents: agents.map((agent) => ({
                id: agent.id,
                username: agent.username,
                name: agent.agentProfile?.displayName || agent.username,
                isActive: agent.isActive,
                overridePointsPerThousand: ruleMap.get(makeRuleKey('AGENT_OVERRIDE', agent.id))?.pointsPerThousand ?? null,
            })),
            managers: managers.map((manager) => ({
                id: manager.id,
                username: manager.username,
                isActive: manager.isActive,
                overridePointsPerThousand: ruleMap.get(makeRuleKey('MANAGER_OVERRIDE', manager.id))?.pointsPerThousand ?? null,
            })),
        })
    } catch (error) {
        console.error('Admin points settings list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = settingsSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid points settings data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const agentIds = parsed.data.agentOverrides.map((item) => item.agentId)
        const managerIds = parsed.data.managerOverrides.map((item) => item.managerId)
        const [validAgents, validManagers] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: agentIds }, role: 'AGENT', deletedAt: null },
                select: { id: true },
            }),
            prisma.user.findMany({
                where: { id: { in: managerIds }, role: 'MANAGER', deletedAt: null },
                select: { id: true },
            }),
        ])

        const validAgentIds = new Set(validAgents.map((item) => item.id))
        const validManagerIds = new Set(validManagers.map((item) => item.id))
        const invalidAgentIds = agentIds.filter((id) => !validAgentIds.has(id))
        const invalidManagerIds = managerIds.filter((id) => !validManagerIds.has(id))

        if (invalidAgentIds.length > 0 || invalidManagerIds.length > 0) {
            return NextResponse.json(
                {
                    error: 'Invalid override owners',
                    invalidAgentIds,
                    invalidManagerIds,
                },
                { status: 400 }
            )
        }

        await prisma.$transaction(async (tx) => {
            await tx.pointRule.updateMany({
                where: {
                    isActive: true,
                    OR: [
                        { ownerType: 'USER_GLOBAL', ownerUserId: null },
                        { ownerType: 'AGENT_DEFAULT', ownerUserId: null },
                        { ownerType: 'MANAGER_DEFAULT', ownerUserId: null },
                        { ownerType: 'AGENT_OVERRIDE' },
                        { ownerType: 'MANAGER_OVERRIDE' },
                    ],
                },
                data: { isActive: false },
            })

            await tx.pointRule.createMany({
                data: [
                    {
                        ownerType: 'USER_GLOBAL',
                        ownerUserId: null,
                        pointsPerThousand: parsed.data.userGlobalPointsPerThousand,
                        updatedByAdminId: authResult.user.id,
                        isActive: true,
                    },
                    {
                        ownerType: 'AGENT_DEFAULT',
                        ownerUserId: null,
                        pointsPerThousand: parsed.data.agentDefaultPointsPerThousand,
                        updatedByAdminId: authResult.user.id,
                        isActive: true,
                    },
                    {
                        ownerType: 'MANAGER_DEFAULT',
                        ownerUserId: null,
                        pointsPerThousand: parsed.data.managerDefaultPointsPerThousand,
                        updatedByAdminId: authResult.user.id,
                        isActive: true,
                    },
                    ...parsed.data.agentOverrides.map((item) => ({
                        ownerType: 'AGENT_OVERRIDE' as const,
                        ownerUserId: item.agentId,
                        pointsPerThousand: item.pointsPerThousand,
                        updatedByAdminId: authResult.user.id,
                        isActive: true,
                    })),
                    ...parsed.data.managerOverrides.map((item) => ({
                        ownerType: 'MANAGER_OVERRIDE' as const,
                        ownerUserId: item.managerId,
                        pointsPerThousand: item.pointsPerThousand,
                        updatedByAdminId: authResult.user.id,
                        isActive: true,
                    })),
                ],
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_POINT_RULES_UPDATED',
                    targetType: 'PointRule',
                    details: {
                        userGlobal: parsed.data.userGlobalPointsPerThousand,
                        agentDefault: parsed.data.agentDefaultPointsPerThousand,
                        managerDefault: parsed.data.managerDefaultPointsPerThousand,
                        agentOverrides: parsed.data.agentOverrides.length,
                        managerOverrides: parsed.data.managerOverrides.length,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Admin update points settings error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
