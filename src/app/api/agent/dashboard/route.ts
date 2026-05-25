import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { RATE_LIMITS, rateLimitHeaders, withRateLimit } from '@/lib/rate-limiter'
import { summarizePointBalance } from '@/lib/points/balance'

function startOfToday() {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'AGENT')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: agent } = authResult

        const { allowed, result: limitResult } = await withRateLimit(
            `agent-dashboard:${agent.id}`,
            RATE_LIMITS.api
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        const today = startOfToday()
        const requestScope = { agentIdSnapshot: agent.id }

        const [
            agentProfile,
            assignments,
            recentRequests,
            requestsToday,
            pendingRequests,
            approvedRequests,
            pointEntries,
        ] = await Promise.all([
            prisma.agentProfile.findUnique({
                where: { agentId: agent.id },
                select: {
                    displayName: true,
                    defaultSourceGroup: true,
                    whapiGroupName: true,
                    whatsappNotificationsEnabled: true,
                    isActive: true,
                },
            }),
            prisma.agentAssignment.findMany({
                where: { agentId: agent.id, isActive: true },
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: {
                    id: true,
                    sourceGroup: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            balance: true,
                            isActive: true,
                            createdAt: true,
                            lastLoginAt: true,
                            creditRequests: {
                                where: requestScope,
                                orderBy: { createdAt: 'desc' },
                                take: 1,
                                select: {
                                    createdAt: true,
                                    status: true,
                                },
                            },
                        },
                    },
                },
            }),
            prisma.creditRequest.findMany({
                where: requestScope,
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: {
                    id: true,
                    requestNumber: true,
                    usernameSnapshot: true,
                    amountUsd: true,
                    paymentMethod: true,
                    sourceGroupSnapshot: true,
                    status: true,
                    createdAt: true,
                    decidedAt: true,
                },
            }),
            prisma.creditRequest.count({
                where: {
                    ...requestScope,
                    createdAt: { gte: today },
                },
            }),
            prisma.creditRequest.count({
                where: {
                    ...requestScope,
                    status: 'PENDING',
                },
            }),
            prisma.creditRequest.count({
                where: {
                    ...requestScope,
                    status: 'APPROVED',
                },
            }),
            prisma.pointLedgerEntry.findMany({
                where: { ownerUserId: agent.id },
                select: { sourceType: true, status: true, points: true },
            }),
        ])

        const pointSummary = summarizePointBalance(pointEntries)

        return NextResponse.json({
            agent: {
                id: agent.id,
                username: agent.username,
                displayName: agentProfile?.displayName || agent.username,
                defaultSourceGroup: agentProfile?.defaultSourceGroup || null,
                whapiGroupName: agentProfile?.whapiGroupName || null,
                whatsappNotificationsEnabled: agentProfile?.whatsappNotificationsEnabled ?? false,
                isConfigured: Boolean(agentProfile?.isActive),
            },
            summary: {
                assignedUsers: assignments.length,
                requestsToday,
                pendingRequests,
                approvedRequests,
                pendingPoints: 0,
                availablePoints: pointSummary.available,
                convertedPoints: pointSummary.converted,
            },
            assignedUsers: assignments.map((assignment) => ({
                id: assignment.user.id,
                username: assignment.user.username,
                balance: assignment.user.balance,
                isActive: assignment.user.isActive,
                sourceGroup: assignment.sourceGroup,
                assignedAt: assignment.createdAt.toISOString(),
                lastLoginAt: assignment.user.lastLoginAt?.toISOString() ?? null,
                lastRequestAt: assignment.user.creditRequests[0]?.createdAt.toISOString() ?? null,
                lastRequestStatus: assignment.user.creditRequests[0]?.status ?? null,
            })),
            creditRequests: recentRequests.map((item) => ({
                id: item.id,
                requestNumber: item.requestNumber,
                username: item.usernameSnapshot,
                amountUsd: item.amountUsd,
                paymentMethod: item.paymentMethod,
                sourceGroup: item.sourceGroupSnapshot,
                status: item.status,
                createdAt: item.createdAt.toISOString(),
                decidedAt: item.decidedAt?.toISOString() ?? null,
            })),
        })
    } catch (error) {
        console.error('Agent dashboard error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
