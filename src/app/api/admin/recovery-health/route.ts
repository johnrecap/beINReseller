import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

const MAINTENANCE_HEALTH_KEY = 'operation-maintenance:health'

type MaintenanceCycleSummary = {
    cycleId: string
    status: 'healthy' | 'degraded' | 'error' | 'idle'
    startedAt: string
    finishedAt: string
    durationMs: number
    inspected: number
    changed: number
    skipped: number
    retried: number
    reviewRequired: number
    refunded: number
    errors: string[]
}

function parseHealth(value: string | null): MaintenanceCycleSummary | null {
    if (!value) return null
    try {
        const parsed = JSON.parse(value) as MaintenanceCycleSummary
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const now = new Date()
        const completingCutoff = new Date(now.getTime() - 2 * 60 * 1000)
        const processingCutoff = new Date(now.getTime() - 5 * 60 * 1000)
        const awaitingPackageCutoff = new Date(now.getTime() - 15 * 60 * 1000)

        const health = parseHealth(await redis.get(MAINTENANCE_HEALTH_KEY).catch(() => null))
        const lastFinishedAt = health?.finishedAt ? new Date(health.finishedAt) : null
        const secondsSinceLastCycle = lastFinishedAt && !Number.isNaN(lastFinishedAt.getTime())
            ? Math.floor((now.getTime() - lastFinishedAt.getTime()) / 1000)
            : null
        const staleRunner = secondsSinceLastCycle === null || secondsSinceLastCycle > 120

        const [
            waitingExpired,
            completingStuck,
            processingStuck,
            reviewRequired,
            pendingDispatch,
            exhaustedDispatch,
            recentDecisions,
        ] = await Promise.all([
            prisma.operation.count({
                where: {
                    status: { in: ['AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM'] },
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                        { updatedAt: { lt: awaitingPackageCutoff } },
                    ],
                },
            }),
            prisma.operation.count({
                where: {
                    status: 'COMPLETING',
                    OR: [
                        { finalConfirmExpiry: { lt: now } },
                        { heartbeatExpiry: { lt: now } },
                        { updatedAt: { lt: completingCutoff } },
                    ],
                },
            }),
            prisma.operation.count({
                where: {
                    status: 'PROCESSING',
                    updatedAt: { lt: processingCutoff },
                },
            }),
            prisma.operation.count({
                where: { status: 'REVIEW_REQUIRED' },
            }),
            prisma.operationDispatch.count({
                where: {
                    jobType: 'CONFIRM_PURCHASE',
                    status: 'PENDING',
                    attempts: { lt: 3 },
                    operation: { status: 'COMPLETING' },
                },
            }),
            prisma.operationDispatch.count({
                where: {
                    jobType: 'CONFIRM_PURCHASE',
                    status: 'PENDING',
                    attempts: { gte: 3 },
                    operation: { status: 'COMPLETING' },
                },
            }),
            prisma.activityLog.findMany({
                where: { action: 'OPERATION_RECOVERY_DECISION' },
                select: {
                    id: true,
                    createdAt: true,
                    targetId: true,
                    details: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
        ])

        const status = staleRunner
            ? 'stale'
            : health?.status === 'degraded' || health?.status === 'error'
                ? 'degraded'
                : 'healthy'

        return NextResponse.json({
            status,
            staleRunner,
            lastCycle: health,
            secondsSinceLastCycle,
            counts: {
                waitingExpired,
                completingStuck,
                processingStuck,
                reviewRequired,
                pendingDispatch,
                exhaustedDispatch,
            },
            recentDecisions: recentDecisions.map((decision) => ({
                id: decision.id,
                operationId: decision.targetId,
                createdAt: decision.createdAt.toISOString(),
                details: decision.details,
            })),
        })
    } catch (error) {
        console.error('Recovery health error:', error)
        return NextResponse.json({
            status: 'degraded',
            error: 'Recovery health is unavailable',
            staleRunner: true,
        }, { status: 200 })
    }
}
