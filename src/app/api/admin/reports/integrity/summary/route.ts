import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

function extractAuditSnapshot(responseData: unknown): Record<string, unknown> | null {
    if (!responseData) return null
    let parsed: Record<string, unknown> | null = null
    if (typeof responseData === 'string') {
        try {
            parsed = JSON.parse(responseData) as Record<string, unknown>
        } catch {
            parsed = null
        }
    } else if (typeof responseData === 'object') {
        parsed = responseData as Record<string, unknown>
    }

    if (!parsed || typeof parsed.auditSnapshot !== 'object' || !parsed.auditSnapshot) {
        return null
    }
    return parsed.auditSnapshot as Record<string, unknown>
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const days = Math.max(1, parseInt(searchParams.get('days') || '30'))
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const [total, byStatus, byType, bySeverity, openHigh, operationsByAccount, operationsForDelta, deductionsByUser] = await Promise.all([
            prisma.operationIntegrityIssue.count({
                where: { detectedAt: { gte: startDate } }
            }),
            prisma.operationIntegrityIssue.groupBy({
                by: ['status'],
                where: { detectedAt: { gte: startDate } },
                _count: true
            }),
            prisma.operationIntegrityIssue.groupBy({
                by: ['issueType'],
                where: { detectedAt: { gte: startDate } },
                _count: true
            }),
            prisma.operationIntegrityIssue.groupBy({
                by: ['severity'],
                where: { detectedAt: { gte: startDate } },
                _count: true
            }),
            prisma.operationIntegrityIssue.count({
                where: {
                    detectedAt: { gte: startDate },
                    status: 'OPEN',
                    severity: 'HIGH'
                }
            }),
            prisma.operation.groupBy({
                by: ['beinAccountId'],
                where: {
                    status: 'COMPLETED',
                    amount: { gt: 0 },
                    completedAt: { gte: startDate },
                    beinAccountId: { not: null }
                },
                _sum: { amount: true },
                _count: true
            }),
            prisma.operation.findMany({
                where: {
                    status: 'COMPLETED',
                    amount: { gt: 0 },
                    completedAt: { gte: startDate },
                    beinAccountId: { not: null }
                },
                select: {
                    beinAccountId: true,
                    responseData: true
                }
            }),
            prisma.transaction.groupBy({
                by: ['userId'],
                where: {
                    type: 'OPERATION_DEDUCT',
                    createdAt: { gte: startDate }
                },
                _sum: { amount: true },
                _count: true
            })
        ])

        const beinAccountIds = operationsByAccount
            .map((row) => row.beinAccountId)
            .filter((id): id is string => Boolean(id))
        const userIds = deductionsByUser
            .map((row) => row.userId)
            .filter((id): id is string => Boolean(id))

        const [accounts, users] = await Promise.all([
            beinAccountIds.length > 0
                ? prisma.beinAccount.findMany({
                    where: { id: { in: beinAccountIds } },
                    select: { id: true, username: true, label: true }
                })
                : Promise.resolve([]),
            userIds.length > 0
                ? prisma.user.findMany({
                    where: { id: { in: userIds } },
                    select: { id: true, username: true }
                })
                : Promise.resolve([])
        ])

        const accountMap = new Map(accounts.map((a) => [a.id, a]))
        const userMap = new Map(users.map((u) => [u.id, u]))

        const beinDeltaByAccount = new Map<string, number>()
        const beinUsernameSnapshotByAccount = new Map<string, string>()
        for (const operation of operationsForDelta) {
            if (!operation.beinAccountId) continue
            const snapshot = extractAuditSnapshot(operation.responseData)
            if (!snapshot) continue
            const delta = typeof snapshot.beinDelta === 'number' ? snapshot.beinDelta : null
            if (delta !== null) {
                beinDeltaByAccount.set(
                    operation.beinAccountId,
                    (beinDeltaByAccount.get(operation.beinAccountId) || 0) + delta
                )
            }
            if (!beinUsernameSnapshotByAccount.has(operation.beinAccountId) && typeof snapshot.beinUsername === 'string') {
                beinUsernameSnapshotByAccount.set(operation.beinAccountId, snapshot.beinUsername)
            }
        }

        const spentByBeinAccount = operationsByAccount
            .filter((row) => !!row.beinAccountId)
            .map((row) => {
                const accountId = row.beinAccountId as string
                const requestedTotal = row._sum.amount || 0
                const beinDeltaTotal = beinDeltaByAccount.get(accountId) || 0
                const account = accountMap.get(accountId)
                return {
                    beinAccountId: accountId,
                    username: beinUsernameSnapshotByAccount.get(accountId) || account?.username || null,
                    label: account?.label || null,
                    requestedTotal,
                    beinDeltaTotal,
                    variance: requestedTotal - beinDeltaTotal,
                    operationsCount: row._count
                }
            })
            .sort((a, b) => b.requestedTotal - a.requestedTotal)

        const spentByUser = deductionsByUser
            .filter((row) => !!row.userId)
            .map((row) => {
                const userId = row.userId as string
                const deductedTotal = Math.abs(row._sum?.amount || 0)
                const user = userMap.get(userId)
                return {
                    userId,
                    username: user?.username || null,
                    deductedTotal,
                    operationsCount: row._count
                }
            })
            .sort((a, b) => b.deductedTotal - a.deductedTotal)

        const totals = {
            requestedTotal: spentByBeinAccount.reduce((sum, row) => sum + row.requestedTotal, 0),
            beinDeltaTotal: spentByBeinAccount.reduce((sum, row) => sum + row.beinDeltaTotal, 0),
            deductedTotal: spentByUser.reduce((sum, row) => sum + row.deductedTotal, 0)
        }

        return NextResponse.json({
            period: { days, startDate: startDate.toISOString() },
            total,
            openHigh,
            byStatus,
            byType,
            bySeverity,
            totals,
            spentByBeinAccount,
            spentByUser
        })
    } catch (error) {
        console.error('Integrity summary error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
