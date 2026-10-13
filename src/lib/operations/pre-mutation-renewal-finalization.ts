import { OperationStatus, Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { createOperationPointReversalsInTransaction } from '@/lib/points/reversals'
import { classifyFinancialReview, reviewCapabilitySelect } from '@/lib/financial-review/capabilities'
import { lockFinancialOperation } from '../../../shared/operations/financial-lock'
import { appendManualReviewDecision } from '@/lib/financial-review/manual-decisions'
import { withFinancialReviewMetadata } from '@/lib/financial-review/evidence'
import { validDecisionNote } from '../../../shared/operations/review-decision-note'

export type WebPreMutationRenewalTerminationResult =
    | { status: 'TERMINATED'; refundId: string | null; refundAmount: number }
    | { status: 'ALREADY_TERMINATED'; refundId: string | null; refundAmount: number }
    | { status: 'REVIEW_REQUIRED'; reason: string }
    | { status: 'EVIDENCE_CONFLICT'; reason: string }

type TerminalStatus = 'FAILED' | 'CANCELLED' | 'EXPIRED'

function responseRecord(value: unknown): Record<string, unknown> {
    if (!value) return {}
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value)
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {}
        } catch {
            return {}
        }
    }
    return typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
}

function finalProviderMutationMayHaveStarted(input: {
    status: OperationStatus
    responseData: unknown
    providerMutationStartedAt: Date | null
    providerMutationStage: string | null
    providerPaymentState: string | null
    renewalFlowVersion: number | null
}): boolean {
    if (input.providerMutationStartedAt || input.providerMutationStage) return true
    if (input.providerPaymentState && input.providerPaymentState !== 'NOT_SUBMITTED') return true

    const data = responseRecord(input.responseData)
    const phase = data.operationPhase ?? data.phase
    const hasLegacyMutationTimestamp = [
        data.finalProviderMutationStartedAt,
        data.finalPayRequestStartedAt,
        data.finalPaySubmittedAt,
    ].some((value) => value !== null && value !== undefined && value !== '')
    if (hasLegacyMutationTimestamp) return true
    if (data.finalPaySubmitted === true) return true
    if (data.providerMutationMayHaveStarted === true &&
        !(input.renewalFlowVersion === 2 &&
            ['PROVIDER_SALE_PREPARATION_STARTED', 'FINAL_CONFIRMATION_REQUESTED'].includes(String(phase)))) return true
    if (
        phase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
        phase === 'FINAL_PAY_REQUEST_STARTED' ||
        phase === 'FINAL_PAY_SUBMITTED' ||
        phase === 'POST_FINAL_PAY_REVIEW'
    ) return true
    if (input.status !== 'COMPLETING') return false
    return ![
        'PACKAGE_PREPARATION',
        'PROVIDER_SALE_PREPARATION_STARTED',
        'CANCELLATION_CONFIRM',
        'FINAL_CONFIRMATION',
        'FINAL_CONFIRMATION_REQUESTED',
        'CUSTOMER_DEDUCTED',
        'DISPATCH_PENDING',
        'DISPATCH_FAILED',
        'RECOVERY_TIMEOUT',
    ].includes(typeof phase === 'string' ? phase : '')
}

function positiveMoney(value: number): number | null {
    if (!Number.isFinite(value)) return null
    const rounded = Math.round(value * 100) / 100
    return rounded > 0 ? rounded : null
}

function sameMoney(left: number, right: number): boolean {
    return Math.abs(left - right) < 0.005
}

export async function finalizeWebPreMutationRenewalTermination(input: {
    operationId: string
    terminalStatus: TerminalStatus
    allowedStatuses: OperationStatus[]
    responseMessage: string
    releaseReason: string
    errorMessage?: string
    retryCount?: number
    adminReview?: { actorId: string; actorUsername: string; note: string }
    expectedStaleHeartbeat?: {
        checkedAt: Date
        noHeartbeatBefore: Date
    }
    activity?: {
        userId: string
        action: string
        details: Prisma.InputJsonValue
        ipAddress: string
    }
}): Promise<WebPreMutationRenewalTerminationResult> {
    try {
        return await prisma.$transaction(async (tx) => {
            if (!await lockFinancialOperation(tx, input.operationId)) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'OPERATION_NOT_FOUND' }
            }

            await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "operation_dispatches"
                WHERE "operation_id" = ${input.operationId}
                FOR UPDATE
            `

            const operation = await tx.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    ...reviewCapabilitySelect,
                    id: true,
                    type: true,
                    status: true,
                    userId: true,
                    customerId: true,
                    amount: true,
                    createdAt: true,
                    lastHeartbeat: true,
                    heartbeatExpiry: true,
                    responseData: true,
                    providerMutationStartedAt: true,
                    providerMutationStage: true,
                    providerPaymentState: true,
                    renewalFlowVersion: true,
                    fulfillmentState: true,
                    fulfillmentAuthority: true,
                    chargedBeinSpendLedger: { select: { id: true } },
                    fulfillmentProof: { select: { id: true } },
                    manualFulfillmentEvidence: { select: { id: true } },
                    storeSubscription: { select: { id: true } },
                    transactions: {
                        where: { type: { in: ['OPERATION_DEDUCT', 'REFUND'] } },
                        select: { id: true, userId: true, type: true, amount: true },
                    },
                    dispatches: {
                        where: { jobType: 'CONFIRM_PURCHASE' },
                        select: { id: true, jobType: true, status: true, attempts: true },
                    },
                },
            })
            if (!operation || operation.type !== 'RENEW') {
                return { status: 'EVIDENCE_CONFLICT', reason: 'RENEWAL_OPERATION_REQUIRED' }
            }

            if (input.adminReview) {
                const actor = await tx.$queryRaw<Array<{ id: string }>>`
                    SELECT "id" FROM "users" WHERE "id" = ${input.adminReview.actorId}
                      AND "role" = 'ADMIN' AND "is_active" = true AND "deleted_at" IS NULL FOR SHARE
                `
                if (actor.length !== 1 || !validDecisionNote(input.adminReview.note, true) ||
                    (operation.status !== input.terminalStatus &&
                        !classifyFinancialReview(operation).allowedActions.includes('RESOLVE_PRE_MUTATION'))) {
                    return { status: 'EVIDENCE_CONFLICT', reason: 'REVIEW_CAPABILITY_CHANGED' }
                }
            }

            if (input.expectedStaleHeartbeat) {
                const heartbeatIsStillStale = Boolean(
                    (
                        operation.heartbeatExpiry &&
                        operation.heartbeatExpiry < input.expectedStaleHeartbeat.checkedAt
                    ) || (
                        operation.lastHeartbeat === null &&
                        operation.createdAt < input.expectedStaleHeartbeat.noHeartbeatBefore
                    )
                )
                if (!heartbeatIsStillStale) {
                    return { status: 'EVIDENCE_CONFLICT', reason: 'HEARTBEAT_NO_LONGER_STALE' }
                }
            }

            const [customerWalletEntries, providerPayments] = await Promise.all([
                operation.customerId
                    ? tx.walletTransaction.findMany({
                        where: {
                            customerId: operation.customerId,
                            referenceId: operation.id,
                            OR: [
                                { type: 'DEBIT' },
                                { referenceType: 'REFUND' },
                            ],
                        },
                        select: {
                            id: true,
                            customerId: true,
                            type: true,
                            amount: true,
                            referenceType: true,
                        },
                    })
                    : Promise.resolve([]),
                operation.customerId
                    ? tx.payment.findMany({
                        where: {
                            customerId: operation.customerId,
                            type: 'SUBSCRIPTION',
                            metadata: { path: ['operationId'], equals: operation.id },
                        },
                        select: { id: true, status: true, stripePaymentIntentId: true },
                    })
                    : Promise.resolve([]),
            ])

            const userDeductions = operation.transactions.filter((entry) => entry.type === 'OPERATION_DEDUCT')
            const userRefunds = operation.transactions.filter((entry) => entry.type === 'REFUND')
            const customerDebits = customerWalletEntries.filter((entry) => entry.type === 'DEBIT')
            const customerRefunds = customerWalletEntries.filter((entry) => entry.referenceType === 'REFUND')
            const userRefundAmount = operation.userId && userDeductions.length === 1 &&
                userDeductions[0].userId === operation.userId && userDeductions[0].amount < 0
                ? positiveMoney(Math.abs(userDeductions[0].amount))
                : null
            const customerRefundAmount = operation.customerId && customerDebits.length === 1 &&
                customerDebits[0].customerId === operation.customerId && customerDebits[0].amount > 0
                ? positiveMoney(customerDebits[0].amount)
                : null
            const canonicalAmount = userRefundAmount ?? customerRefundAmount ?? 0
            const hasFinancialExposure =
                operation.amount > 0 || userDeductions.length > 0 || customerDebits.length > 0
            const existingUserRefund = userRefunds.length === 1 ? userRefunds[0] : null
            const existingCustomerRefund = customerRefunds.length === 1 ? customerRefunds[0] : null
            const exactExistingRefund = Boolean(
                canonicalAmount > 0 &&
                (
                    (
                        operation.userId && existingUserRefund && userRefunds.length === 1 &&
                        existingUserRefund.userId === operation.userId &&
                        sameMoney(existingUserRefund.amount, canonicalAmount)
                    ) || (
                        operation.customerId && existingCustomerRefund && customerRefunds.length === 1 &&
                        existingCustomerRefund.customerId === operation.customerId &&
                        sameMoney(existingCustomerRefund.amount, canonicalAmount)
                    )
                )
            )
            const settlementConflict =
                operation.refundSettlements.some(row => row.state !== 'CANCELLED') ||
                userRefunds.length > 1 || customerRefunds.length > 1 ||
                (operation.userId !== null && customerDebits.length > 0) ||
                (operation.customerId !== null && userDeductions.length > 0) ||
                (operation.userId !== null && userDeductions.length !== (hasFinancialExposure ? 1 : 0)) ||
                (operation.customerId !== null && customerDebits.length !== (hasFinancialExposure ? 1 : 0)) ||
                (hasFinancialExposure && canonicalAmount <= 0) ||
                (operation.amount > 0 && canonicalAmount > 0 && !sameMoney(operation.amount, canonicalAmount)) ||
                ((userRefunds.length > 0 || customerRefunds.length > 0) && !exactExistingRefund)

            const unsafeDispatch = operation.dispatches.some((dispatch) =>
                !['PENDING', 'CANCELLED'].includes(dispatch.status) || dispatch.attempts !== 0)
            const providerAmbiguity =
                finalProviderMutationMayHaveStarted(operation) ||
                unsafeDispatch ||
                Boolean(operation.chargedBeinSpendLedger) ||
                Boolean(operation.fulfillmentProof) ||
                Boolean(operation.manualFulfillmentEvidence) ||
                operation.fulfillmentState !== 'UNVERIFIED' ||
                operation.fulfillmentAuthority !== 'NONE'

            const moveToReview = async (reason: string) => {
                const reviewUpdate = await tx.operation.updateMany({
                    where: { id: operation.id, status: operation.status },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: reason,
                        completedAt: null,
                        finalConfirmExpiry: null,
                        heartbeatExpiry: null,
                    },
                })
                if (reviewUpdate.count !== 1) {
                    throw new Error('PRE_MUTATION_REVIEW_STATE_RACE')
                }
                await tx.operationDispatch.updateMany({
                    where: {
                        operationId: operation.id,
                        jobType: 'CONFIRM_PURCHASE',
                        status: 'PENDING',
                    },
                    data: {
                        status: 'CANCELLED',
                        lastError: reason,
                    },
                })
                return { status: 'REVIEW_REQUIRED' as const, reason }
            }

            if (operation.status === input.terminalStatus) {
                if ((!hasFinancialExposure || exactExistingRefund) && !providerAmbiguity && !settlementConflict) {
                    const repairedAt = new Date()
                    if (exactExistingRefund) {
                        await createOperationPointReversalsInTransaction({
                            db: tx,
                            operationId: operation.id,
                            reason: 'refund',
                        })
                    }
                    await Promise.all([
                        tx.cardLifecycleReservation.updateMany({
                            where: { operationId: operation.id, releasedAt: null },
                            data: { releasedAt: repairedAt, releaseReason: input.releaseReason },
                        }),
                        tx.providerAccountCausalReservation.updateMany({
                            where: { operationId: operation.id, releasedAt: null },
                            data: { releasedAt: repairedAt, releaseReason: input.releaseReason },
                        }),
                    ])
                    return {
                        status: 'ALREADY_TERMINATED',
                        refundId: existingUserRefund?.id ?? existingCustomerRefund?.id ?? null,
                        refundAmount: exactExistingRefund ? canonicalAmount : 0,
                    }
                }
                return moveToReview('Canonical pre-mutation settlement is missing or conflicting.')
            }
            if (!input.allowedStatuses.includes(operation.status)) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'TERMINATION_STATUS_CHANGED' }
            }
            if (providerAmbiguity) {
                return moveToReview('Provider mutation causality is uncertain; manual review required.')
            }
            if (operation.storeSubscription || providerPayments.length > 0 || settlementConflict) {
                return moveToReview('Canonical pre-mutation settlement is missing or conflicting.')
            }

            let refundId = existingUserRefund?.id ?? existingCustomerRefund?.id ?? null
            if (canonicalAmount > 0) {
                if (!exactExistingRefund && operation.userId && userRefundAmount) {
                    const user = await tx.user.update({
                        where: { id: operation.userId },
                        data: { balance: { increment: userRefundAmount } },
                        select: { id: true, balance: true },
                    })
                    const refund = await tx.transaction.create({
                        data: {
                            userId: user.id,
                            operationId: operation.id,
                            type: 'REFUND',
                            amount: userRefundAmount,
                            balanceAfter: user.balance,
                            notes: `Atomic pre-mutation refund: ${input.responseMessage}`,
                        },
                        select: { id: true },
                    })
                    refundId = refund.id
                } else if (!exactExistingRefund && operation.customerId && customerRefundAmount) {
                    const customer = await tx.customer.update({
                        where: { id: operation.customerId },
                        data: { walletBalance: { increment: customerRefundAmount } },
                        select: { id: true, walletBalance: true },
                    })
                    const refund = await tx.walletTransaction.create({
                        data: {
                            customerId: customer.id,
                            type: 'REFUND',
                            amount: customerRefundAmount,
                            balanceBefore: customer.walletBalance - customerRefundAmount,
                            balanceAfter: customer.walletBalance,
                            description: `Atomic pre-mutation refund: ${input.responseMessage}`,
                            referenceType: 'REFUND',
                            referenceId: operation.id,
                        },
                        select: { id: true },
                    })
                    refundId = refund.id
                }
                await createOperationPointReversalsInTransaction({
                    db: tx,
                    operationId: operation.id,
                    reason: 'refund',
                })
            }

            const completedAt = new Date()
            const updated = await tx.operation.updateMany({
                where: { id: operation.id, status: operation.status },
                data: {
                    status: input.terminalStatus,
                    responseMessage: input.responseMessage,
                    error: input.errorMessage,
                    completedAt,
                    ...(input.adminReview ? { responseData: withFinancialReviewMetadata(operation.responseData, current =>
                        appendManualReviewDecision(current, { action: 'REFUND_CUSTOMER', note: input.adminReview!.note,
                            decidedBy: input.adminReview!.actorId, decidedByUsername: input.adminReview!.actorUsername,
                            decidedAt: completedAt.toISOString(), refundApplied: refundId !== null,
                            source: 'admin_manual_review' })) } : {}),
                    finalConfirmExpiry: null,
                    heartbeatExpiry: null,
                    ...(input.retryCount === undefined ? {} : { retryCount: input.retryCount }),
                },
            })
            if (updated.count !== 1) throw new Error('PRE_MUTATION_TERMINATION_STATE_RACE')

            await Promise.all([
                tx.operationDispatch.updateMany({
                    where: {
                        operationId: operation.id,
                        jobType: 'CONFIRM_PURCHASE',
                        status: 'PENDING',
                    },
                    data: {
                        status: 'CANCELLED',
                        lastError: input.releaseReason,
                    },
                }),
                tx.cardLifecycleReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: { releasedAt: completedAt, releaseReason: input.releaseReason },
                }),
                tx.providerAccountCausalReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: { releasedAt: completedAt, releaseReason: input.releaseReason },
                }),
            ])

            if (input.activity) {
                await tx.activityLog.create({ data: input.activity })
            }

            return {
                status: 'TERMINATED',
                refundId,
                refundAmount: canonicalAmount,
            }
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return { status: 'EVIDENCE_CONFLICT', reason: 'PRE_MUTATION_SETTLEMENT_UNIQUENESS_CONFLICT' }
        }
        throw error
    }
}
