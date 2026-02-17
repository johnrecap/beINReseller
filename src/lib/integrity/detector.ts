import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const INTEGRITY_EPSILON = 0.01

type IntegrityIssueType =
    | 'NO_BEIN_BALANCE_CHANGE'
    | 'BEIN_DEBIT_NO_USER_DEDUCT'
    | 'BEIN_DEBIT_USER_UNDERDEDUCTED'
    | 'TELEMETRY_MISSING'

interface IntegrityEvaluationInput {
    operationAmount: number
    userDeductAmount: number
    beinBalanceBefore: number | null
    beinBalanceAfter: number | null
}

interface EvaluatedIssue {
    issueType: IntegrityIssueType
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    beinDelta: number | null
    details: Record<string, unknown>
}

interface SnapshotInput {
    beinBalanceBefore?: number | null
    beinBalanceAfter?: number | null
}

function toNullableNumber(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) return null
    return value
}

function evaluateIntegrityIssues(input: IntegrityEvaluationInput): EvaluatedIssue[] {
    const issues: EvaluatedIssue[] = []
    const { operationAmount, userDeductAmount, beinBalanceBefore, beinBalanceAfter } = input

    if (operationAmount <= 0) return issues

    if (beinBalanceBefore === null || beinBalanceAfter === null) {
        issues.push({
            issueType: 'TELEMETRY_MISSING',
            severity: 'HIGH',
            beinDelta: null,
            details: {
                reason: 'Missing beIN balance snapshot for completed paid operation',
                beinBalanceBefore,
                beinBalanceAfter
            }
        })
        return issues
    }

    const beinDelta = beinBalanceBefore - beinBalanceAfter

    if (beinDelta <= INTEGRITY_EPSILON) {
        issues.push({
            issueType: 'NO_BEIN_BALANCE_CHANGE',
            severity: 'HIGH',
            beinDelta,
            details: {
                reason: 'Paid operation completed without beIN balance reduction',
                beinDelta,
                epsilon: INTEGRITY_EPSILON
            }
        })
    }

    if (beinDelta > INTEGRITY_EPSILON && userDeductAmount <= INTEGRITY_EPSILON) {
        issues.push({
            issueType: 'BEIN_DEBIT_NO_USER_DEDUCT',
            severity: 'HIGH',
            beinDelta,
            details: {
                reason: 'beIN balance reduced but no user deduction transaction found',
                userDeductAmount,
                beinDelta,
                epsilon: INTEGRITY_EPSILON
            }
        })
    } else if (beinDelta > userDeductAmount + INTEGRITY_EPSILON) {
        issues.push({
            issueType: 'BEIN_DEBIT_USER_UNDERDEDUCTED',
            severity: 'HIGH',
            beinDelta,
            details: {
                reason: 'beIN balance reduced more than recorded user deduction',
                userDeductAmount,
                beinDelta,
                epsilon: INTEGRITY_EPSILON
            }
        })
    }

    return issues
}

async function upsertIssue(params: {
    operationId: string
    userId: string | null
    beinAccountId: string | null
    operationAmount: number
    userDeductAmount: number
    beinBalanceBefore: number | null
    beinBalanceAfter: number | null
    issue: EvaluatedIssue
}) {
    const {
        operationId,
        userId,
        beinAccountId,
        operationAmount,
        userDeductAmount,
        beinBalanceBefore,
        beinBalanceAfter,
        issue
    } = params

    const now = new Date()
    const issueWhere = {
        operationId_issueType: {
            operationId,
            issueType: issue.issueType
        }
    } as const

    await prisma.$transaction(async (tx) => {
        await tx.operationIntegrityIssue.upsert({
            where: issueWhere,
            create: {
                operationId,
                userId,
                beinAccountId,
                issueType: issue.issueType,
                severity: issue.severity,
                status: 'OPEN',
                operationAmount,
                userDeductAmount,
                beinBalanceBefore,
                beinBalanceAfter,
                beinDelta: issue.beinDelta,
                details: issue.details as Prisma.InputJsonValue,
                detectedAt: now,
                lastSeenAt: now
            },
            update: {
                severity: issue.severity,
                operationAmount,
                userDeductAmount,
                beinBalanceBefore,
                beinBalanceAfter,
                beinDelta: issue.beinDelta,
                details: issue.details as Prisma.InputJsonValue,
                lastSeenAt: now
            }
        })

        await tx.operationIntegrityIssue.updateMany({
            where: {
                operationId,
                issueType: issue.issueType,
                status: 'RESOLVED'
            },
            data: { status: 'OPEN' }
        })
    })
}

async function resolveSnapshotsFromActivityLog(operationId: string): Promise<SnapshotInput> {
    const log = await prisma.activityLog.findFirst({
        where: {
            targetId: operationId,
            action: 'OPERATION_COMPLETE'
        },
        orderBy: { createdAt: 'desc' },
        select: { details: true }
    })

    if (!log?.details || typeof log.details !== 'object') {
        return {}
    }

    const details = log.details as Record<string, unknown>
    return {
        beinBalanceBefore: toNullableNumber(details.beinBalanceBefore),
        beinBalanceAfter: toNullableNumber(details.beinBalanceAfter)
    }
}

export async function detectAndRecordOperationIntegrity(
    operationId: string,
    snapshot?: SnapshotInput
): Promise<void> {
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            amount: true,
            status: true,
            userId: true,
            beinAccountId: true
        }
    })

    if (!operation || operation.status !== 'COMPLETED') return
    if (!operation.amount || operation.amount <= 0) return

    const deductionAgg = await prisma.transaction.aggregate({
        where: {
            operationId,
            type: 'OPERATION_DEDUCT'
        },
        _sum: { amount: true }
    })

    const userDeductAmount = Math.abs(deductionAgg._sum.amount || 0)
    const activitySnapshot = await resolveSnapshotsFromActivityLog(operationId)
    const beinBalanceBefore = toNullableNumber(snapshot?.beinBalanceBefore ?? activitySnapshot.beinBalanceBefore)
    const beinBalanceAfter = toNullableNumber(snapshot?.beinBalanceAfter ?? activitySnapshot.beinBalanceAfter)

    const issues = evaluateIntegrityIssues({
        operationAmount: operation.amount,
        userDeductAmount,
        beinBalanceBefore,
        beinBalanceAfter
    })

    for (const issue of issues) {
        await upsertIssue({
            operationId,
            userId: operation.userId || null,
            beinAccountId: operation.beinAccountId || null,
            operationAmount: operation.amount,
            userDeductAmount,
            beinBalanceBefore,
            beinBalanceAfter,
            issue
        })
    }
}
