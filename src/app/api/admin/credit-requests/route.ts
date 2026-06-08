import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    calculatePoints,
    getAgentCreditRequestRate,
    getUserCreditRequestRate,
} from '@/lib/credit-requests/points'
import { buildWhatsAppPhoneUrl } from '@/lib/credit-requests/whatsapp-handoff'

const allowedStatuses = new Set(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])

function parseDate(value: string | null): Date | undefined {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}

function toNumberParam(value: string | null, fallback: number, max: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.min(Math.floor(parsed), max)
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')
        const agentId = searchParams.get('agentId')
        const sourceGroup = searchParams.get('sourceGroup')
        const escalated = searchParams.get('escalated')
        const search = searchParams.get('search')?.trim()
        const from = parseDate(searchParams.get('from'))
        const to = parseDate(searchParams.get('to'))
        const page = toNumberParam(searchParams.get('page'), 1, 10000)
        const limit = toNumberParam(searchParams.get('limit'), 25, 100)
        const skip = (page - 1) * limit

        const where: Prisma.CreditRequestWhereInput = {}

        if (status && allowedStatuses.has(status)) {
            where.status = status as Prisma.EnumCreditRequestStatusFilter['equals']
        }

        if (agentId) {
            where.agentIdSnapshot = agentId
        }

        if (sourceGroup) {
            where.sourceGroupSnapshot = sourceGroup
        }

        if (escalated === 'true') {
            where.escalated = true
        } else if (escalated === 'false') {
            where.escalated = false
        }

        if (from || to) {
            where.createdAt = {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
            }
        }

        if (search) {
            where.OR = [
                { requestNumber: { contains: search, mode: 'insensitive' } },
                { usernameSnapshot: { contains: search, mode: 'insensitive' } },
                { paymentMethod: { contains: search, mode: 'insensitive' } },
                { ownerLabelSnapshot: { contains: search, mode: 'insensitive' } },
                { agentNameSnapshot: { contains: search, mode: 'insensitive' } },
                { sourceGroupSnapshot: { contains: search, mode: 'insensitive' } },
            ]
        }

        const [items, total, summary, agents, sourceGroups] = await Promise.all([
            prisma.creditRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    requestNumber: true,
                    usernameSnapshot: true,
                    amountUsd: true,
                    paymentMethod: true,
                    notes: true,
                    ownerTypeSnapshot: true,
                    ownerIdSnapshot: true,
                    ownerLabelSnapshot: true,
                    agentIdSnapshot: true,
                    agentNameSnapshot: true,
                    sourceGroupSnapshot: true,
                    status: true,
                    escalated: true,
                    escalationNote: true,
                    createdAt: true,
                    decidedAt: true,
                    decisionNote: true,
                    transactionId: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            balance: true,
                            isActive: true,
                        },
                    },
                    decidedByAdmin: {
                        select: {
                            id: true,
                            username: true,
                        },
                    },
                    notifications: {
                        where: { eventType: 'CREDIT_REQUEST_CREATED' },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            provider: true,
                            targetType: true,
                            status: true,
                            targetGroupId: true,
                            targetGroupNameSnapshot: true,
                            error: true,
                            lastAttemptAt: true,
                        },
                    },
                    whatsappHandoff: {
                        select: {
                            id: true,
                            destinationLabel: true,
                            whatsappGroupUrl: true,
                            whatsappPhone: true,
                            messageText: true,
                            groupOpenAvailable: true,
                            phoneOpenAvailable: true,
                            createdAt: true,
                        },
                    },
                },
            }),
            prisma.creditRequest.count({ where }),
            prisma.creditRequest.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            prisma.user.findMany({
                where: { role: 'AGENT', isActive: true, deletedAt: null },
                orderBy: { username: 'asc' },
                select: {
                    id: true,
                    username: true,
                    agentProfile: {
                        select: { displayName: true },
                    },
                },
            }),
            prisma.creditRequest.findMany({
                where: { sourceGroupSnapshot: { not: null } },
                distinct: ['sourceGroupSnapshot'],
                orderBy: { sourceGroupSnapshot: 'asc' },
                select: { sourceGroupSnapshot: true },
            }),
        ])

        const userRate = await getUserCreditRequestRate(prisma)
        const agentRates = new Map<string, number>()
        const responseItems = []

        for (const item of items) {
            const agentIdForRate = item.agentIdSnapshot || ''
            if (agentIdForRate && !agentRates.has(agentIdForRate)) {
                agentRates.set(agentIdForRate, await getAgentCreditRequestRate(prisma, agentIdForRate))
            }

            const agentRate = agentRates.get(agentIdForRate) ?? 0
            const latestNotification = item.notifications[0]
            responseItems.push({
                id: item.id,
                requestNumber: item.requestNumber,
                username: item.usernameSnapshot,
                user: item.user,
                amountUsd: item.amountUsd,
                paymentMethod: item.paymentMethod,
                notes: item.notes,
                ownerType: item.ownerTypeSnapshot || (item.agentIdSnapshot ? 'AGENT' : null),
                ownerId: item.ownerIdSnapshot || item.agentIdSnapshot,
                ownerLabel: item.ownerLabelSnapshot || item.agentNameSnapshot,
                agentId: item.agentIdSnapshot,
                agentName: item.agentNameSnapshot,
                sourceGroup: item.sourceGroupSnapshot,
                status: item.status,
                escalated: item.escalated,
                escalationNote: item.escalationNote,
                createdAt: item.createdAt.toISOString(),
                decidedAt: item.decidedAt?.toISOString() || null,
                decidedByAdmin: item.decidedByAdmin,
                decisionNote: item.decisionNote,
                transactionId: item.transactionId,
                notification: latestNotification ? {
                    provider: latestNotification.provider,
                    targetType: latestNotification.targetType,
                    status: latestNotification.status,
                    targetId: latestNotification.targetGroupId,
                    targetLabel: latestNotification.targetGroupNameSnapshot,
                    error: latestNotification.error,
                    lastAttemptAt: latestNotification.lastAttemptAt?.toISOString() || null,
                    retryAvailable: item.status === 'PENDING'
                        && (latestNotification.status === 'FAILED' || latestNotification.status === 'DISABLED'),
                } : null,
                whatsappHandoff: item.whatsappHandoff ? {
                    id: item.whatsappHandoff.id,
                    destinationLabel: item.whatsappHandoff.destinationLabel,
                    groupUrl: item.whatsappHandoff.whatsappGroupUrl,
                    phone: item.whatsappHandoff.whatsappPhone,
                    phoneUrl: buildWhatsAppPhoneUrl(item.whatsappHandoff.whatsappPhone, item.whatsappHandoff.messageText),
                    messageText: item.whatsappHandoff.messageText,
                    groupOpenAvailable: item.whatsappHandoff.groupOpenAvailable,
                    phoneOpenAvailable: item.whatsappHandoff.phoneOpenAvailable,
                    createdAt: item.whatsappHandoff.createdAt.toISOString(),
                } : null,
                pointsPreview: {
                    user: calculatePoints({
                        ownerKind: 'USER',
                        amountUsd: item.amountUsd,
                        pointsPerThousand: userRate,
                    }),
                    agent: calculatePoints({
                        ownerKind: 'AGENT',
                        amountUsd: item.amountUsd,
                        pointsPerThousand: agentRate,
                    }),
                },
            })
        }

        return NextResponse.json({
            summary: summary.reduce<Record<string, number>>((acc, row) => {
                acc[row.status] = row._count._all
                return acc
            }, {}),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
            filters: {
                agents: agents.map((agent) => ({
                    id: agent.id,
                    name: agent.agentProfile?.displayName || agent.username,
                    username: agent.username,
                })),
                sourceGroups: sourceGroups
                    .map((row) => row.sourceGroupSnapshot)
                    .filter((value): value is string => Boolean(value)),
            },
            items: responseItems,
        })
    } catch (error) {
        console.error('Admin list credit requests error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
