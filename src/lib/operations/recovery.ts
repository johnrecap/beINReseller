import type { OperationStatus, OperationType, Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { refundUser } from '@/lib/refund'
import {
    classifyRecovery,
    type RecoveryDecision,
    type RecoveryFinancialImpact,
    type RecoverySource,
} from '@/lib/operations/recovery-classifier'
import {
    getRecoveryProviderBalanceRepairEvidence,
    hasRecoveryProviderCompletionProof,
    type RecoveryProviderBalanceRepairEvidence,
} from '@/lib/operations/recovery-proof'
import { acquireRecoveryLock, releaseRecoveryLock } from '@/lib/operations/recovery-locks'
import { isTerminalOperationStatus, parseOperationResponseData } from '@/lib/operation-safety'
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

const RECOVERY_LEDGER_SELECT = {
    id: true,
    beinAccountId: true,
    spendAmount: true,
    dealerBalanceBefore: true,
    dealerBalanceAfter: true,
    evidenceConfidence: true,
} satisfies Prisma.BeinAccountSpendLedgerSelect

type RecoveryLedgerRow = {
    id: string
    beinAccountId: string
    spendAmount: number
    dealerBalanceBefore: number
    dealerBalanceAfter: number
    evidenceConfidence: string | null
}

type RecoveryBeinAccountSnapshot = {
    id: string
    username: string
    label: string | null
    proxyId: string | null
    proxy: { label: string | null; host: string } | null
}

type RecoveryRepairOperation = {
    id: string
    userId: string | null
    type: OperationType
    status: OperationStatus
    cardNumber: string
    amount: number
    responseData: Prisma.JsonValue | null
    selectedPackage: Prisma.JsonValue | null
    beinAccountId: string | null
    beinAccount: RecoveryBeinAccountSnapshot | null
    transactions: Array<{
        type: string
        amount: number
        balanceAfter: number
        createdAt: Date
    }>
    chargedBeinSpendLedger: RecoveryLedgerRow | null
}

function toNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function moneyMatches(left: number | null, right: number | null): boolean {
    return left !== null && right !== null && Math.abs(left - right) <= 0.01
}

function selectedPackageText(value: unknown, key: 'name' | 'package' | 'title'): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const entry = (value as Record<string, unknown>)[key]
    return typeof entry === 'string' && entry.trim() ? entry.trim() : null
}

function selectedPackagePrice(value: unknown): number | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const raw = record.price ?? record.dealerPrice
    const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return Number.isFinite(numeric) ? numeric : null
}

function parseCapturedAt(value: string | null): Date | null {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function ledgerMatchesRepairEvidence(
    ledger: RecoveryLedgerRow,
    evidence: RecoveryProviderBalanceRepairEvidence
): boolean {
    return ledger.beinAccountId === evidence.beinAccountId &&
        moneyMatches(ledger.spendAmount, evidence.spendAmount) &&
        moneyMatches(ledger.dealerBalanceBefore, evidence.dealerBalanceBefore) &&
        moneyMatches(ledger.dealerBalanceAfter, evidence.dealerBalanceAfter)
}

function mergeRecoveryAuditSnapshot(
    responseData: unknown,
    auditSnapshot: Record<string, unknown>
): Prisma.InputJsonObject {
    const base = parseOperationResponseData(responseData)
    delete base.sessionData
    const existingAudit =
        base.auditSnapshot && typeof base.auditSnapshot === 'object' && !Array.isArray(base.auditSnapshot)
            ? base.auditSnapshot as Record<string, unknown>
            : {}

    return {
        ...base,
        auditSnapshot: {
            ...existingAudit,
            ...auditSnapshot,
        },
    } as Prisma.InputJsonObject
}

function buildRecoveryAuditSnapshot(input: {
    operation: RecoveryRepairOperation
    account: RecoveryBeinAccountSnapshot
    evidence: RecoveryProviderBalanceRepairEvidence
    ledger: RecoveryLedgerRow
    now: Date
}): Record<string, unknown> {
    const deductions = input.operation.transactions.filter(transaction => transaction.type === 'OPERATION_DEDUCT')
    const userDeductTotal = Math.abs(deductions.reduce((sum, transaction) => sum + transaction.amount, 0))
    const latestDeduction = deductions[0]
    const userBalanceAfter = toNullableNumber(latestDeduction?.balanceAfter)
    const userBalanceBefore = userBalanceAfter === null ? null : userBalanceAfter + userDeductTotal

    const auditSnapshot: Record<string, unknown> = {
        beinAccountId: input.evidence.beinAccountId,
        beinUsername: input.account.username,
        beinBalanceBefore: input.evidence.dealerBalanceBefore,
        beinBalanceAfter: input.evidence.dealerBalanceAfter,
        beinDelta: input.evidence.spendAmount,
        beinBalanceBeforeSource: input.evidence.dealerBalanceBeforeSource,
        beinBalanceAfterSource: input.evidence.dealerBalanceAfterSource,
        providerEvidenceState: 'confirmed-final-pay',
        outcomeCategory: 'CONFIRMED_SUCCESS',
        reviewSource: 'recovery-repair',
        chargedBeinLedgerId: input.ledger.id,
        userId: input.operation.userId,
        userDeductTotal,
        userBalanceBefore,
        userBalanceAfter,
        capturedAt: input.evidence.capturedAt || input.now.toISOString(),
    }

    if (input.evidence.diagnosticDealerBalanceBefore !== null) {
        auditSnapshot.diagnosticDealerBalanceBefore = input.evidence.diagnosticDealerBalanceBefore
    }
    if (input.evidence.diagnosticDealerBalanceBeforeSource) {
        auditSnapshot.diagnosticDealerBalanceBeforeSource = input.evidence.diagnosticDealerBalanceBeforeSource
    }

    return auditSnapshot
}

async function getRecoveryRepairAccount(
    tx: Prisma.TransactionClient,
    operation: RecoveryRepairOperation,
    beinAccountId: string
): Promise<RecoveryBeinAccountSnapshot | null> {
    if (operation.beinAccount?.id === beinAccountId) return operation.beinAccount

    return tx.beinAccount.findUnique({
        where: { id: beinAccountId },
        select: {
            id: true,
            username: true,
            label: true,
            proxyId: true,
            proxy: { select: { label: true, host: true } },
        },
    })
}

async function repairConfirmedProviderRecoveryEvidence(
    tx: Prisma.TransactionClient,
    operation: RecoveryRepairOperation,
    now: Date
): Promise<{
    responseData: Prisma.InputJsonObject
    chargedBeinSpendLedger: RecoveryLedgerRow
} | null> {
    if (isTerminalOperationStatus(operation.status) || !operation.userId) return null

    const evidence = getRecoveryProviderBalanceRepairEvidence({
        responseData: operation.responseData,
        operationId: operation.id,
        beinAccountId: operation.beinAccountId,
        cardNumber: operation.cardNumber,
        expectedCost: operation.amount,
    })
    if (!evidence) return null

    const account = await getRecoveryRepairAccount(tx, operation, evidence.beinAccountId)
    if (!account) return null

    const existingLedger = operation.chargedBeinSpendLedger
        ?? await tx.beinAccountSpendLedger.findUnique({
            where: { operationId: operation.id },
            select: RECOVERY_LEDGER_SELECT,
        })

    let ledger: RecoveryLedgerRow
    if (existingLedger) {
        if (!ledgerMatchesRepairEvidence(existingLedger, evidence)) return null
        ledger = existingLedger.evidenceConfidence === 'CONFIRMED_FINAL_PAY'
            ? existingLedger
            : await tx.beinAccountSpendLedger.update({
                where: { id: existingLedger.id },
                data: { evidenceConfidence: 'CONFIRMED_FINAL_PAY' },
                select: RECOVERY_LEDGER_SELECT,
            })
    } else {
        if (operation.beinAccountId && operation.beinAccountId !== evidence.beinAccountId) return null

        if (!operation.beinAccountId) {
            await tx.operation.updateMany({
                where: { id: operation.id, beinAccountId: null },
                data: { beinAccountId: evidence.beinAccountId },
            })
        }

        const packageName =
            selectedPackageText(operation.selectedPackage, 'name') ??
            selectedPackageText(operation.selectedPackage, 'package') ??
            selectedPackageText(operation.selectedPackage, 'title') ??
            evidence.packageName

        ledger = await tx.beinAccountSpendLedger.create({
            data: {
                operationId: operation.id,
                userId: operation.userId,
                beinAccountId: evidence.beinAccountId,
                proxyId: account.proxyId,
                operationType: operation.type,
                operationStatusAtRecord: operation.status,
                cardNumberSnapshot: operation.cardNumber,
                selectedPackageName: packageName,
                selectedPackagePrice: selectedPackagePrice(operation.selectedPackage) ?? evidence.packagePrice,
                currency: 'USD',
                dealerBalanceBefore: evidence.dealerBalanceBefore,
                dealerBalanceAfter: evidence.dealerBalanceAfter,
                spendAmount: evidence.spendAmount,
                evidenceSource: 'BALANCE_DELTA',
                evidenceConfidence: 'CONFIRMED_FINAL_PAY',
                beinUsernameSnapshot: account.username,
                beinLabelSnapshot: account.label,
                proxyLabelSnapshot: account.proxy?.label || account.proxy?.host || null,
                chargedAt: parseCapturedAt(evidence.capturedAt) ?? now,
            },
            select: RECOVERY_LEDGER_SELECT,
        })
    }

    const auditSnapshot = buildRecoveryAuditSnapshot({
        operation,
        account,
        evidence,
        ledger,
        now,
    })

    return {
        responseData: mergeRecoveryAuditSnapshot(operation.responseData, auditSnapshot),
        chargedBeinSpendLedger: ledger,
    }
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
                        orderBy: { createdAt: 'desc' },
                        select: { id: true, type: true, amount: true, balanceAfter: true, createdAt: true },
                    },
                    dispatches: {
                        where: { jobType: 'CONFIRM_PURCHASE' },
                        select: { id: true, status: true, attempts: true, lastError: true },
                    },
                    beinAccount: {
                        select: {
                            id: true,
                            username: true,
                            label: true,
                            proxyId: true,
                            proxy: { select: { label: true, host: true } },
                        },
                    },
                    chargedBeinSpendLedger: {
                        select: RECOVERY_LEDGER_SELECT,
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
            const repairedProviderEvidence = await repairConfirmedProviderRecoveryEvidence(tx, operation, now)
            const recoveryResponseData = repairedProviderEvidence?.responseData ?? operation.responseData
            const recoveryLedger = repairedProviderEvidence?.chargedBeinSpendLedger ?? operation.chargedBeinSpendLedger
            const classifier = classifyRecovery({
                operationId,
                status: operation.status,
                amount: operation.amount,
                responseData: recoveryResponseData,
                finalConfirmExpiry: operation.finalConfirmExpiry,
                heartbeatExpiry: operation.heartbeatExpiry,
                updatedAt: operation.updatedAt,
                now,
                customerDeductTransactionExists: hasDeduct || operation.amount > 0,
                refundTransactionExists: hasRefund,
                dispatchPending: dispatch?.status === 'PENDING',
                dispatchFailed: !!dispatch?.lastError || dispatch?.status === 'FAILED',
                dispatchExhausted: (dispatch?.attempts ?? 0) >= 3 && (!!dispatch?.lastError || dispatch?.status === 'FAILED'),
                providerChargeCompletionProof: hasRecoveryProviderCompletionProof({
                    responseData: recoveryResponseData,
                    chargedBeinSpendLedger: recoveryLedger,
                }),
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
            const responseData = mergeRecoveryEvidence(recoveryResponseData, {
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
