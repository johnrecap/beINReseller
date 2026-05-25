import type { OperationStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { refundUser } from '@/lib/refund'
import {
    classifyRecovery,
    type RecoveryDecision,
    type RecoveryFinancialImpact,
    type RecoverySource,
} from '@/lib/operations/recovery-classifier'
import { acquireRecoveryLock, releaseRecoveryLock } from '@/lib/operations/recovery-locks'
import { parseOperationResponseData } from '@/lib/operation-safety'
import {
    releaseAccountLockSafely,
    type AccountLockReleaseEvidence,
} from '@/lib/operations/account-lock-release'
import { mergeRecoveryEvidence } from '@/lib/operations/recovery-evidence'
import { processCompletedOperationPoints } from '@/lib/points/operation-awards'

export interface RecoverOperationResult {
    operationId: string
    changed: boolean
    skipped?: boolean
    previousStatus?: OperationStatus
    newStatus?: OperationStatus
    decision: RecoveryDecision
    reason: string
    financialImpact: RecoveryFinancialImpact
    reviewRequired: boolean
    refundApplied: boolean
    lockReleased: boolean
    lockRelease?: AccountLockReleaseEvidence
}

function getRecoveryStatus(decision: RecoveryDecision): OperationStatus | null {
    switch (decision) {
        case 'EXPIRE':
            return 'EXPIRED'
        case 'CANCEL':
            return 'CANCELLED'
        case 'SAFE_REFUND':
            return 'FAILED'
        case 'COMPLETE':
            return 'COMPLETED'
        case 'REVIEW_REQUIRED':
            return 'REVIEW_REQUIRED'
        default:
            return null
    }
}

function getRecoveryMessage(decision: RecoveryDecision, reason: string): string {
    switch (decision) {
        case 'EXPIRE':
            return `Operation expired: ${reason}`
        case 'CANCEL':
            return `Operation cancelled by recovery: ${reason}`
        case 'SAFE_REFUND':
            return `Operation failed safely: ${reason}`
        case 'COMPLETE':
            return `Operation completed by recovery: ${reason}`
        case 'REVIEW_REQUIRED':
            return `Manual review required: ${reason}`
        case 'RETRY_DISPATCH':
            return `Dispatch retry required: ${reason}`
        default:
            return reason
    }
}

function getExpectedAccountLockOwner(responseData: unknown): string | null {
    const data = parseOperationResponseData(responseData)
    const owner = data.accountLockOwner ?? data.beinAccountLockOwner
    return typeof owner === 'string' && owner.trim() ? owner : null
}

export async function recoverOperationIfNeeded(
    operationId: string,
    source: RecoverySource,
    options?: { now?: Date }
): Promise<RecoverOperationResult> {
    const lock = await acquireRecoveryLock(operationId, source)
    if (!lock) {
        return {
            operationId,
            changed: false,
            skipped: true,
            decision: 'NO_ACTION',
            reason: 'recovery_lock_held',
            financialImpact: 'NONE',
            reviewRequired: false,
            refundApplied: false,
            lockReleased: false,
        }
    }

    const now = options?.now ?? new Date()
    let shouldReleaseAccountLock = false
    let result: RecoverOperationResult | null = null

    try {
        result = await prisma.$transaction(async (tx) => {
            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                include: {
                    transactions: {
                        where: { type: { in: ['OPERATION_DEDUCT', 'REFUND'] } },
                        select: { id: true, type: true },
                    },
                    dispatches: {
                        where: { jobType: 'CONFIRM_PURCHASE' },
                        select: { id: true, status: true, attempts: true, lastError: true },
                    },
                },
            })

            if (!operation) {
                return {
                    operationId,
                    changed: false,
                    skipped: true,
                    decision: 'NO_ACTION' as const,
                    reason: 'operation_not_found',
                    financialImpact: 'NONE' as const,
                    reviewRequired: false,
                    refundApplied: false,
                    lockReleased: false,
                }
            }

            const hasDeduct = operation.transactions.some(txn => txn.type === 'OPERATION_DEDUCT')
            const hasRefund = operation.transactions.some(txn => txn.type === 'REFUND')
            const dispatch = operation.dispatches[0]
            const classifier = classifyRecovery({
                operationId,
                status: operation.status,
                amount: operation.amount,
                responseData: operation.responseData,
                finalConfirmExpiry: operation.finalConfirmExpiry,
                heartbeatExpiry: operation.heartbeatExpiry,
                updatedAt: operation.updatedAt,
                now,
                customerDeductTransactionExists: hasDeduct || operation.amount > 0,
                refundTransactionExists: hasRefund,
                dispatchPending: dispatch?.status === 'PENDING',
                dispatchFailed: !!dispatch?.lastError || dispatch?.status === 'FAILED',
                dispatchExhausted: (dispatch?.attempts ?? 0) >= 3 && (!!dispatch?.lastError || dispatch?.status === 'FAILED'),
                source,
            })

            let decision = classifier.decision
            let nextStatus = getRecoveryStatus(decision)

            if (decision === 'SAFE_REFUND' && !operation.userId) {
                decision = 'REVIEW_REQUIRED'
                nextStatus = 'REVIEW_REQUIRED'
            }

            if (decision === 'NO_ACTION') {
                return {
                    operationId,
                    changed: false,
                    previousStatus: operation.status,
                    newStatus: operation.status,
                    decision,
                    reason: classifier.reason,
                    financialImpact: classifier.financialImpact,
                    reviewRequired: false,
                    refundApplied: false,
                    lockReleased: false,
                }
            }

            const message = getRecoveryMessage(decision, classifier.reason)
            const responseData = mergeRecoveryEvidence(operation.responseData, {
                source,
                decision,
                reason: classifier.reason,
                financialImpact: classifier.financialImpact,
                at: now,
            })

            if (decision === 'RETRY_DISPATCH') {
                await tx.operation.updateMany({
                    where: { id: operation.id, status: operation.status },
                    data: {
                        responseMessage: message,
                        responseData,
                    },
                })
            } else if (nextStatus) {
                const update = await tx.operation.updateMany({
                    where: { id: operation.id, status: operation.status },
                    data: {
                        status: nextStatus,
                        responseMessage: message,
                        responseData,
                        finalConfirmExpiry: null,
                        heartbeatExpiry: null,
                        completedAt: ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(nextStatus)
                            ? now
                            : operation.completedAt,
                    },
                })

                if (update.count === 0) {
                    return {
                        operationId,
                        changed: false,
                        skipped: true,
                        previousStatus: operation.status,
                        decision: 'NO_ACTION' as const,
                        reason: 'operation_state_changed',
                        financialImpact: classifier.financialImpact,
                        reviewRequired: false,
                        refundApplied: false,
                        lockReleased: false,
                    }
                }
            }

            if (operation.userId) {
                await tx.activityLog.create({
                    data: {
                        userId: operation.userId,
                        action: 'OPERATION_RECOVERY_DECISION',
                        targetId: operation.id,
                        targetType: 'Operation',
                        ipAddress: `recovery:${source}`,
                        details: {
                            operationId,
                            previousStatus: operation.status,
                            newStatus: nextStatus || operation.status,
                            decision,
                            reason: classifier.reason,
                            financialImpact: classifier.financialImpact,
                            reviewRequired: decision === 'REVIEW_REQUIRED',
                            refundAllowed: classifier.refundAllowed,
                        },
                    },
                })
            }

            shouldReleaseAccountLock = decision !== 'RETRY_DISPATCH'

            return {
                operationId,
                changed: true,
                previousStatus: operation.status,
                newStatus: nextStatus || operation.status,
                decision,
                reason: classifier.reason,
                financialImpact: classifier.financialImpact,
                reviewRequired: decision === 'REVIEW_REQUIRED',
                refundApplied: false,
                lockReleased: false,
            }
        })

        if (result.decision === 'SAFE_REFUND') {
            const operation = await prisma.operation.findUnique({
                where: { id: operationId },
                select: { userId: true, amount: true, responseMessage: true },
            })
            const refunded = operation?.userId && operation.amount > 0
                ? await refundUser(operationId, operation.userId, operation.amount, operation.responseMessage || result.reason)
                : false
            result.refundApplied = refunded
            if (!refunded && result.decision === 'SAFE_REFUND') {
                await prisma.operation.updateMany({
                    where: { id: operationId, status: 'FAILED' },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: 'Safe refund was not applied; manual review required.',
                    },
                })
                result.newStatus = 'REVIEW_REQUIRED'
                result.reviewRequired = true
            }
        }

        if (result.newStatus === 'COMPLETED') {
            await processCompletedOperationPoints(operationId).catch((error) => {
                console.error('Recovery point award error:', error)
            })
        }

        if (shouldReleaseAccountLock) {
            const operation = await prisma.operation.findUnique({
                where: { id: operationId },
                select: { beinAccountId: true, responseData: true },
            })
            const lockRelease = await releaseAccountLockSafely(
                redis,
                operation?.beinAccountId ?? null,
                getExpectedAccountLockOwner(operation?.responseData)
            )
            result.lockReleased = lockRelease.released
            result.lockRelease = lockRelease

            if (operation) {
                await prisma.operation.update({
                    where: { id: operationId },
                    data: {
                        responseData: mergeRecoveryEvidence(operation.responseData, {
                            source,
                            decision: result.decision,
                            reason: result.reason,
                            financialImpact: result.financialImpact,
                            at: now,
                            lockRelease,
                        }),
                    },
                })
            }
        }

        return result
    } finally {
        await releaseRecoveryLock(lock).catch(() => undefined)
    }
}
