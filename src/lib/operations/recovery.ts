import type { OperationStatus, OperationType, Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
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
import { acquireRecoveryLock, hasActiveProviderExecutionLeaseForOperation, releaseRecoveryLock } from '@/lib/operations/recovery-locks'
import {
    hasOperationFinancialExposureForReview,
    isTerminalOperationStatus,
    parseOperationResponseData,
} from '@/lib/operation-safety'
import {
    releaseAccountLockSafely,
    type AccountLockReleaseEvidence,
} from '@/lib/operations/account-lock-release'
import { mergeRecoveryEvidence } from '@/lib/operations/recovery-evidence'
import {
    captureOperationSpendAwardRunInTransaction,
    finalizeOperationSpendAwardRun,
} from '@/lib/points/operation-spend-award-runs'
import { createOperationPointReversalsInTransaction } from '@/lib/points/reversals'
import { lockFinancialOperation } from '../../../shared/operations/financial-lock'
import { resolveAuditOwner } from '../../../shared/operations/audit-financial-context'

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
    userId: true,
    customerId: true,
    beinAccountId: true,
    spendAmount: true,
    dealerBalanceBefore: true,
    dealerBalanceAfter: true,
    evidenceConfidence: true,
} satisfies Prisma.BeinAccountSpendLedgerSelect

type RecoveryLedgerRow = {
    id: string
    userId: string | null
    customerId: string | null
    beinAccountId: string
    spendAmount: number
    dealerBalanceBefore: number | null
    dealerBalanceAfter: number | null
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
    customerId: string | null
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
    if (isTerminalOperationStatus(operation.status)) return null
    try { resolveAuditOwner(operation) } catch { return null }

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
        if (existingLedger.userId !== operation.userId || existingLedger.customerId !== operation.customerId) return null
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
                customerId: operation.customerId,
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
    let atomicRefundApplied = false
    let result: RecoverOperationResult | null = null

    try {
        result = await prisma.$transaction(async (tx) => {
            await lockFinancialOperation(tx, operationId)
            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                include: {
                    transactions: {
                        where: { type: { in: ['OPERATION_DEDUCT', 'REFUND'] } },
                        orderBy: { createdAt: 'desc' },
                        select: { id: true, userId: true, type: true, amount: true, balanceAfter: true, createdAt: true },
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
                    fulfillmentProof: {
                        select: {
                            id: true,
                            operationId: true,
                            beinAccountId: true,
                            cardNumberSnapshot: true,
                            invoiceNo: true,
                            proofKind: true,
                        },
                    },
                    manualFulfillmentEvidence: {
                        select: {
                            id: true,
                            operationId: true,
                            beinAccountId: true,
                            cardNumberSnapshot: true,
                            invoiceNo: true,
                        },
                    },
                },
            })

            if (!operation || operation.administrativeStopRequestedAt) {
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

            if (operation.status === 'COMPLETING' && operation.beinAccountId &&
                await hasActiveProviderExecutionLeaseForOperation(operation.beinAccountId, operation.id)) {
                console.info('[Recovery] Active provider execution; recovery deferred:', JSON.stringify({
                    operationId, source,
                }))
                return {
                    operationId,
                    changed: false,
                    skipped: true,
                    previousStatus: operation.status,
                    newStatus: operation.status,
                    decision: 'NO_ACTION' as const,
                    reason: 'active_provider_execution',
                    financialImpact: 'UNCERTAIN' as const,
                    reviewRequired: false,
                    refundApplied: false,
                    lockReleased: false,
                }
            }

            const operationDeductTotal = Math.abs(operation.transactions
                .filter(txn => txn.type === 'OPERATION_DEDUCT')
                .reduce((sum, txn) => sum + txn.amount, 0))
            const hasDeduct = operationDeductTotal > 0
            const hasRefund = operation.transactions.some(txn => txn.type === 'REFUND')
            const customerWalletDebit = await tx.walletTransaction.findFirst({
                where: {
                    referenceId: operation.id,
                    type: 'DEBIT',
                },
                select: { id: true },
            })
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
                customerDeductTransactionExists: hasDeduct || Boolean(customerWalletDebit),
                refundTransactionExists: hasRefund,
                dispatchPending: dispatch?.status === 'PENDING',
                dispatchFailed: !!dispatch?.lastError || dispatch?.status === 'FAILED',
                dispatchExhausted: (dispatch?.attempts ?? 0) >= 3 && (!!dispatch?.lastError || dispatch?.status === 'FAILED'),
                providerChargeCompletionProof: hasRecoveryProviderCompletionProof({
                    responseData: recoveryResponseData,
                    chargedBeinSpendLedger: recoveryLedger,
                    fulfillmentProof: operation.fulfillmentProof,
                    manualFulfillmentEvidence: operation.manualFulfillmentEvidence,
                    fulfillmentAuthority: operation.fulfillmentAuthority,
                    operationId: operation.id,
                    beinAccountId: operation.beinAccountId,
                    cardNumber: operation.cardNumber,
                }),
                source,
            })
            const financialExposureForReview = hasOperationFinancialExposureForReview({
                operationStatus: operation.status,
                operationAmount: operation.amount,
                operationResponseData: recoveryResponseData,
                phaseEvidence: classifier.phaseEvidence,
                transactions: operation.transactions,
                customerWalletDebitExists: Boolean(customerWalletDebit),
                chargedBeinSpendLedgerExists: Boolean(recoveryLedger),
                refundTransactionExists: hasRefund,
            })

            let decision = classifier.decision
            let nextStatus = getRecoveryStatus(decision)

            const recoveryEvidence = parseOperationResponseData(recoveryResponseData)
            const legacyProviderMutationMarker =
                recoveryEvidence.operationPhase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
                recoveryEvidence.operationPhase === 'FINAL_PAY_REQUEST_STARTED' ||
                recoveryEvidence.phase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
                recoveryEvidence.phase === 'FINAL_PAY_REQUEST_STARTED'
            const providerMutationMayHaveStarted = Boolean(
                operation.providerMutationStartedAt || legacyProviderMutationMarker
            )

            if (decision === 'RETRY_DISPATCH' && providerMutationMayHaveStarted) {
                decision = 'REVIEW_REQUIRED'
                nextStatus = 'REVIEW_REQUIRED'
            }
            // Financial installment closure and post-mutation negative renewal closure require
            // the dedicated locked evidence finalizers; recovery must not infer them from JSON.
            if ((operation.purpose === 'INSTALLMENT' && (providerMutationMayHaveStarted || operation.amount > 0) &&
                    ['COMPLETE', 'SAFE_REFUND', 'EXPIRE', 'CANCEL', 'RETRY_DISPATCH'].includes(decision)) ||
                (operation.type === 'RENEW' && providerMutationMayHaveStarted && decision === 'SAFE_REFUND') ||
                (recoveryLedger && (recoveryLedger.userId !== operation.userId || recoveryLedger.customerId !== operation.customerId))) {
                decision = 'REVIEW_REQUIRED'
                nextStatus = 'REVIEW_REQUIRED'
            }

            if (
                decision === 'SAFE_REFUND' &&
                operation.type === 'RENEW' &&
                providerMutationMayHaveStarted &&
                !(
                    operation.providerPaymentState === 'NOT_CHARGED' &&
                    operation.fulfillmentState === 'NOT_FOUND' &&
                    operation.fulfillmentVerificationOutcome === 'VALID_NO_MATCH'
                )
            ) {
                decision = 'REVIEW_REQUIRED'
                nextStatus = 'REVIEW_REQUIRED'
            }

            if (decision === 'SAFE_REFUND' && !operation.userId && financialExposureForReview) {
                decision = 'REVIEW_REQUIRED'
                nextStatus = 'REVIEW_REQUIRED'
            }

            let canonicalRefundAmount: number | null = null
            if (decision === 'SAFE_REFUND' && operation.userId) {
                const deductions = operation.transactions.filter(txn => txn.type === 'OPERATION_DEDUCT')
                const validCanonicalDeduction =
                    deductions.length === 1 &&
                    deductions[0].userId === operation.userId &&
                    Number.isFinite(deductions[0].amount) &&
                    deductions[0].amount < 0
                canonicalRefundAmount = validCanonicalDeduction
                    ? Math.round(Math.abs(deductions[0].amount) * 100) / 100
                    : null
                if (financialExposureForReview && !canonicalRefundAmount) {
                    decision = 'REVIEW_REQUIRED'
                    nextStatus = 'REVIEW_REQUIRED'
                }
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

                if (nextStatus === 'COMPLETED') {
                    const capture = await captureOperationSpendAwardRunInTransaction(
                        tx,
                        operation.id,
                        'WEB_RECOVERY',
                        now
                    )
                    if (capture.outcome === 'CONFLICT') {
                        throw new Error('AWARD_RUN_CONFLICT')
                    }
                    await tx.operationIntegrityIssue.updateMany({
                        where: {
                            operationId: operation.id,
                            issueType: {
                                in: [
                                    'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                                    'FULFILLMENT_PROOF_CONFLICT',
                                ],
                            },
                            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
                        },
                        data: {
                            status: 'RESOLVED',
                            reviewedAt: now,
                            reviewNote: 'Resolved atomically by proof-authorized recovery completion.',
                        },
                    })
                }

                if (
                    decision === 'SAFE_REFUND' &&
                    nextStatus === 'FAILED' &&
                    operation.userId &&
                    canonicalRefundAmount
                ) {
                    const user = await tx.user.update({
                        where: { id: operation.userId },
                        data: { balance: { increment: canonicalRefundAmount } },
                        select: { id: true, balance: true },
                    })
                    const refund = await tx.transaction.create({
                        data: {
                            userId: user.id,
                            operationId: operation.id,
                            type: 'REFUND',
                            amount: canonicalRefundAmount,
                            balanceAfter: user.balance,
                            notes: `Atomic recovery refund: ${message}`,
                        },
                        select: { id: true },
                    })
                    await Promise.all([
                        tx.notification.create({
                            data: {
                                userId: user.id,
                                title: 'Amount refunded',
                                message: `Amount ${canonicalRefundAmount} refunded after safe operation recovery.`,
                                type: 'info',
                                link: '/dashboard/transactions',
                            },
                        }),
                        createOperationPointReversalsInTransaction({
                            db: tx,
                            operationId: operation.id,
                            reason: 'refund',
                        }),
                        tx.operationIntegrityIssue.updateMany({
                            where: { operationId: operation.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
                            data: {
                                status: 'RESOLVED',
                                reviewedAt: now,
                                reviewNote: `Resolved atomically by recovery refund ${refund.id}.`,
                            },
                        }),
                    ])
                    atomicRefundApplied = true
                }

                if (
                    (
                        decision !== 'SAFE_REFUND' &&
                        ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(nextStatus)
                    ) ||
                    (decision === 'SAFE_REFUND' && nextStatus === 'FAILED')
                ) {
                    const releaseReason = `SAFE_TERMINAL:RECOVERY_${decision}`
                    await Promise.all([
                        tx.cardLifecycleReservation.updateMany({
                            where: { operationId: operation.id, releasedAt: null },
                            data: { releasedAt: now, releaseReason },
                        }),
                        tx.providerAccountCausalReservation.updateMany({
                            where: { operationId: operation.id, releasedAt: null },
                            data: { releasedAt: now, releaseReason },
                        }),
                    ])
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
                refundApplied: atomicRefundApplied,
                lockReleased: false,
            }
        })

        if (result.newStatus === 'COMPLETED') {
            await finalizeOperationSpendAwardRun(operationId).catch((error) => {
                console.error('Recovery point finalization error:', error)
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
