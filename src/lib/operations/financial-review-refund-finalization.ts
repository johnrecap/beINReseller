import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
    appendManualReviewDecision,
} from '@/lib/financial-review/manual-decisions'
import {
    extractFinancialReviewMetadata,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'
import { createOperationPointReversalsInTransaction } from '@/lib/points/reversals'
import { classifyFinancialReview, reviewCapabilitySelect } from '@/lib/financial-review/capabilities'
import { lockFinancialOperation } from '../../../shared/operations/financial-lock'

export type FinancialReviewRefundFinalizationResult =
    | { status: 'REFUNDED'; refundId: string }
    | { status: 'ALREADY_REFUNDED'; refundId: string }
    | {
        status:
            | 'INVALID_DECISION_NOTE'
            | 'OPERATION_NOT_REVIEWABLE'
            | 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED'
            | 'REFUND_TARGET_MISSING'
            | 'CANONICAL_SETTLEMENT_REQUIRED'
            | 'REFUND_CONFLICT'
      }

function normalizedNote(note: string): string | null {
    const value = note.trim()
    return value && value.length <= 2_000 ? value : null
}

function existingDecisionIsRefunded(responseData: unknown): boolean {
    const decision = extractFinancialReviewMetadata(responseData).latestDecision
    return decision?.action === 'REFUND_CUSTOMER' && decision.refundApplied === true
}

function normalizedPositiveAmount(value: number): number | null {
    if (!Number.isFinite(value)) return null
    const rounded = Math.round(value * 100) / 100
    return rounded > 0 ? rounded : null
}

export async function finalizeStrictFinancialReviewRefund(input: {
    operationId: string
    decisionNote: string
    actorUserId: string
    actorUsername: string
}): Promise<FinancialReviewRefundFinalizationResult> {
    const note = normalizedNote(input.decisionNote)
    if (!input.operationId.trim() || !input.actorUserId.trim() || !note) {
        return { status: 'INVALID_DECISION_NOTE' }
    }

    try {
        return await prisma.$transaction(async (tx) => {
            if (!await lockFinancialOperation(tx, input.operationId)) return { status: 'OPERATION_NOT_REVIEWABLE' }

            const operation = await tx.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    ...reviewCapabilitySelect,
                    id: true,
                    type: true,
                    status: true,
                    userId: true,
                    customerId: true,
                    responseData: true,
                    providerMutationStartedAt: true,
                    providerMutationStage: true,
                    providerPaymentState: true,
                    fulfillmentState: true,
                    fulfillmentVerificationOutcome: true,
                    fulfillmentAuthority: true,
                    chargedBeinSpendLedger: { select: { id: true } },
                    fulfillmentProof: { select: { id: true } },
                    manualFulfillmentEvidence: { select: { id: true } },
                    storeSubscription: { select: { id: true } },
                    fulfillmentVerification: {
                        select: {
                            lastOutcome: true,
                            nextCheckAt: true,
                            attempts: {
                                orderBy: { attemptNo: 'desc' },
                                take: 1,
                                select: {
                                    outcome: true,
                                    completeScan: true,
                                    retryDueAt: true,
                                },
                            },
                        },
                    },
                },
            })
            if (!operation) return { status: 'OPERATION_NOT_REVIEWABLE' }
            const actorRows = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "users" WHERE "id" = ${input.actorUserId}
                  AND "role" = 'ADMIN' AND "is_active" = true AND "deleted_at" IS NULL FOR SHARE
            `
            if (actorRows.length !== 1) return { status: 'OPERATION_NOT_REVIEWABLE' }

            const [
                actor,
                userRefund,
                customerRefund,
                userDeductions,
                customerWalletDebits,
                customerProviderPayments,
            ] = await Promise.all([
                tx.user.findUnique({
                    where: { id: input.actorUserId },
                    select: { id: true, role: true, isActive: true },
                }),
                tx.transaction.findFirst({
                    where: { operationId: operation.id, type: 'REFUND' },
                    select: { id: true },
                }),
                operation.customerId
                    ? tx.walletTransaction.findFirst({
                        where: {
                            referenceId: operation.id,
                            referenceType: 'REFUND',
                        },
                        select: { id: true },
                    })
                    : Promise.resolve(null),
                operation.userId
                    ? tx.transaction.findMany({
                        where: {
                            operationId: operation.id,
                            userId: operation.userId,
                            type: 'OPERATION_DEDUCT',
                        },
                        select: { id: true, userId: true, amount: true },
                    })
                    : Promise.resolve([]),
                operation.customerId
                    ? tx.walletTransaction.findMany({
                        where: {
                            customerId: operation.customerId,
                            referenceId: operation.id,
                            type: 'DEBIT',
                        },
                        select: { id: true, customerId: true, amount: true },
                    })
                    : Promise.resolve([]),
                operation.customerId
                    ? tx.payment.findMany({
                        where: {
                            customerId: operation.customerId,
                            type: 'SUBSCRIPTION',
                            metadata: {
                                path: ['operationId'],
                                equals: operation.id,
                            },
                        },
                        select: { id: true, stripePaymentIntentId: true, amount: true, status: true },
                    })
                    : Promise.resolve([]),
            ])

            const existingRefundId = userRefund?.id ?? customerRefund?.id ?? null
            if (existingRefundId) {
                return operation.status === 'FAILED' && existingDecisionIsRefunded(operation.responseData)
                    ? { status: 'ALREADY_REFUNDED', refundId: existingRefundId }
                    : { status: 'REFUND_CONFLICT' }
            }

            if (operation.userId && !classifyFinancialReview(operation).allowedActions.includes('REFUND_CUSTOMER')) {
                return { status: 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED' }
            }

            if (
                operation.status !== 'REVIEW_REQUIRED' ||
                operation.type !== 'RENEW' ||
                !actor ||
                actor.role !== 'ADMIN' ||
                !actor.isActive
            ) {
                return { status: 'OPERATION_NOT_REVIEWABLE' }
            }

            const latestAttempt = operation.fulfillmentVerification?.attempts[0]
            const confirmedNoCharge =
                operation.providerMutationStartedAt instanceof Date &&
                operation.providerMutationStage === 'FINAL_OK' &&
                operation.providerPaymentState === 'NOT_CHARGED' &&
                operation.fulfillmentState === 'NOT_FOUND' &&
                operation.fulfillmentVerificationOutcome === 'VALID_NO_MATCH' &&
                operation.fulfillmentAuthority === 'NONE' &&
                operation.fulfillmentVerification?.lastOutcome === 'VALID_NO_MATCH' &&
                operation.fulfillmentVerification.nextCheckAt === null &&
                latestAttempt?.outcome === 'VALID_NO_MATCH' &&
                latestAttempt.completeScan === true &&
                latestAttempt.retryDueAt === null &&
                !operation.chargedBeinSpendLedger &&
                !operation.fulfillmentProof &&
                !operation.manualFulfillmentEvidence
            if (!confirmedNoCharge) {
                return { status: 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED' }
            }
            let refundId: string
            if (operation.userId) {
                const refundAmount = normalizedPositiveAmount(Math.abs(
                    userDeductions.reduce((sum, deduction) => sum + deduction.amount, 0)
                ))
                if (
                    !refundAmount ||
                    userDeductions.length !== 1 ||
                    userDeductions.some((deduction) =>
                        deduction.userId !== operation.userId || deduction.amount >= 0
                    )
                ) {
                    return { status: 'CANONICAL_SETTLEMENT_REQUIRED' }
                }
                const user = await tx.user.update({
                    where: { id: operation.userId },
                    data: { balance: { increment: refundAmount } },
                    select: { id: true, balance: true },
                })
                const refund = await tx.transaction.create({
                    data: {
                        userId: user.id,
                        operationId: operation.id,
                        type: 'REFUND',
                        amount: refundAmount,
                        balanceAfter: user.balance,
                        notes: `Financial review refund: ${note}`,
                    },
                    select: { id: true },
                })
                refundId = refund.id
                await tx.notification.create({
                    data: {
                        userId: user.id,
                        title: 'Amount refunded',
                        message: `Amount ${refundAmount} refunded after admin review.`,
                        type: 'info',
                        link: '/dashboard/transactions',
                    },
                })
            } else if (operation.customerId) {
                // Store subscriptions and direct Stripe payments require a provider-aware
                // refund saga. Never turn an external-card payment or store-credit debit
                // into wallet balance merely because operation.amount is available.
                if (operation.storeSubscription || customerProviderPayments.length > 0) {
                    return { status: 'CANONICAL_SETTLEMENT_REQUIRED' }
                }
                const refundAmount = normalizedPositiveAmount(
                    customerWalletDebits.reduce((sum, debit) => sum + debit.amount, 0)
                )
                if (
                    !refundAmount ||
                    customerWalletDebits.some((debit) =>
                        debit.customerId !== operation.customerId || debit.amount <= 0
                    )
                ) {
                    return { status: 'CANONICAL_SETTLEMENT_REQUIRED' }
                }
                const customer = await tx.customer.update({
                    where: { id: operation.customerId },
                    data: { walletBalance: { increment: refundAmount } },
                    select: { id: true, walletBalance: true },
                })
                const refund = await tx.walletTransaction.create({
                    data: {
                        customerId: customer.id,
                        type: 'REFUND',
                        amount: refundAmount,
                        balanceBefore: customer.walletBalance - refundAmount,
                        balanceAfter: customer.walletBalance,
                        description: `Financial review refund: ${note}`,
                        referenceType: 'REFUND',
                        referenceId: operation.id,
                    },
                    select: { id: true },
                })
                refundId = refund.id
            } else {
                return { status: 'REFUND_TARGET_MISSING' }
            }

            await createOperationPointReversalsInTransaction({
                db: tx,
                operationId: operation.id,
                reason: 'refund',
            })

            const completedAt = new Date()
            const responseData = withFinancialReviewMetadata(operation.responseData, (current) =>
                appendManualReviewDecision(current, {
                    action: 'REFUND_CUSTOMER',
                    note,
                    decidedBy: actor.id,
                    decidedByUsername: input.actorUsername,
                    decidedAt: completedAt.toISOString(),
                    refundApplied: true,
                    paymentStatus: 'لم يتم تأكيد الدفع',
                    source: 'admin_manual_review',
                })
            )
            const updated = await tx.operation.updateMany({
                where: {
                    id: operation.id,
                    status: 'REVIEW_REQUIRED',
                    providerPaymentState: 'NOT_CHARGED',
                    fulfillmentState: 'NOT_FOUND',
                    fulfillmentVerificationOutcome: 'VALID_NO_MATCH',
                },
                data: {
                    status: 'FAILED',
                    completedAt,
                    responseMessage: 'Financial review closed after confirmed no-charge evidence and refund.',
                    responseData,
                },
            })
            if (updated.count !== 1) throw new Error('REFUND_FINALIZATION_CONFLICT')

            await Promise.all([
                tx.operationIntegrityIssue.updateMany({
                    where: {
                        operationId: operation.id,
                        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
                    },
                    data: {
                        status: 'RESOLVED',
                        reviewedAt: completedAt,
                        reviewNote: `Resolved by strict confirmed-no-charge refund ${refundId}.`,
                    },
                }),
                tx.cardLifecycleReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: {
                        releasedAt: completedAt,
                        releaseReason: `MANUAL_REVIEW_RESOLVED:${refundId}`,
                    },
                }),
                tx.providerAccountCausalReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: {
                        releasedAt: completedAt,
                        releaseReason: `MANUAL_REVIEW_RESOLVED:${refundId}`,
                    },
                }),
            ])

            return { status: 'REFUNDED', refundId }
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return { status: 'REFUND_CONFLICT' }
        }
        throw error
    }
}
